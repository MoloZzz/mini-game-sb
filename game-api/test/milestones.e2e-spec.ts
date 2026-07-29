import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { getDataSourceToken } from '@nestjs/typeorm';
import { MILESTONE_LADDER } from '@card-game/shared-types';
import request from 'supertest';
import type { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import type { AppConfig } from '../src/config/configuration';
import { PlayerEntity } from '../src/entities';
import { MilestoneService } from '../src/milestones/milestone.service';
import { createTestPlayer, deleteTestPlayers } from './auth.helper';

/**
 * Collection milestones (economy fix, part 1). Runs against the isolated
 * `cardgame_test` database (see test/env.setup.ts) — baseline 60 approved
 * cards (see collection.e2e-spec.ts's header comment), which means only the
 * first two rungs of the ladder (`unique_10`, `unique_25`) are ever reachable
 * here; everything above that is exercised by `milestone.service.spec.ts`'s
 * pure unit tests instead, where the "owned" count is just a mocked number.
 *
 * `npm run test:e2e` runs `--runInBand`, so this suite's own player is never
 * racing another suite for the same row.
 */
describe('Collection milestones (e2e)', () => {
  let app: NestExpressApplication;
  let dataSource: DataSource;
  let playerId: string;
  let token: string;
  let baseUrl: string;
  let approvedCardIds: string[];

  const EMAIL_PREFIX = 'test-milestones';
  const TIER_10_REWARD = MILESTONE_LADDER.find((t) => t.key === 'unique_10')!.reward;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication<NestExpressApplication>();

    const configService = app.get(ConfigService<AppConfig, true>);
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    app.enableCors({ origin: true });
    const storageDir = configService.get('storageDir', { infer: true });
    app.useStaticAssets(storageDir, { prefix: '/static' });

    // Real ephemeral port (not just app.init()) so the mandatory concurrency
    // test can fire genuinely overlapping raw HTTP requests — same reason
    // open-case.e2e-spec.ts does this.
    await app.listen(0);
    const address = app.getHttpServer().address();
    const port = typeof address === 'object' && address !== null ? address.port : 0;
    baseUrl = `http://127.0.0.1:${port}`;

    dataSource = app.get(getDataSourceToken());

    await deleteTestPlayers(dataSource, EMAIL_PREFIX);
    const account = await createTestPlayer(app, { emailPrefix: EMAIL_PREFIX });
    playerId = account.playerId;
    token = account.token;

    const cards: Array<{ id: string }> = await dataSource.query(
      `SELECT id FROM cards WHERE status = 'approved' ORDER BY id`,
    );
    approvedCardIds = cards.map((c) => c.id);
    expect(approvedCardIds.length).toBeGreaterThanOrEqual(10);

    await resetPlayerState(1_000_000, 5_000, []);
  });

  /**
   * Wipes every row this suite could have created, re-baselines the ledger
   * with a single `initial_grant` (same pattern as the other e2e suites),
   * then directly seeds `ownedCardIds` as owned unsold copies — bypassing
   * `openCase` entirely so a specific unique-card count can be set up
   * deterministically instead of hoping the RNG lands on it.
   */
  // Wrapped in a single `dataSource.transaction()` — with the deferred
  // ledger-invariant constraint trigger live on `players` (see
  // AddLedgerInvariantTrigger1785200000002), running these as separate
  // implicit transactions would let the `UPDATE players` commit be checked
  // against a ledger the preceding `DELETE FROM transactions` had just
  // emptied. One transaction means the deferred check only ever sees the
  // final, consistent state at COMMIT.
  async function resetPlayerState(
    coins: number,
    keys: number,
    ownedCardIds: string[],
  ): Promise<void> {
    await dataSource.transaction(async (manager) => {
      await manager.query('DELETE FROM player_milestones WHERE player_id = $1', [playerId]);
      await manager.query('DELETE FROM player_cards WHERE player_id = $1', [playerId]);
      await manager.query('DELETE FROM case_openings WHERE player_id = $1', [playerId]);
      await manager.query('DELETE FROM transactions WHERE player_id = $1', [playerId]);
      await manager.getRepository(PlayerEntity).update(playerId, {
        balanceCoins: coins,
        balanceKeys: keys,
        pityCounter: 0,
        lastDailyClaimAt: null,
      });
      await manager.query(
        `INSERT INTO transactions (player_id, type, delta_coins, delta_keys, ref_type, ref_id)
         VALUES ($1, 'initial_grant', $2, $3, 'e2e-test-reset', NULL)`,
        [playerId, coins, keys],
      );
      for (const cardId of ownedCardIds) {
        await manager.query(
          `INSERT INTO player_cards (player_id, card_id, drop_id, sold_at) VALUES ($1, $2, NULL, NULL)`,
          [playerId, cardId],
        );
      }
    });
  }

  afterAll(async () => {
    await deleteTestPlayers(dataSource, EMAIL_PREFIX);
    await app.close();
  });

  async function ledgerInvariantViolations(): Promise<unknown[]> {
    return dataSource.query(
      `SELECT p.id FROM players p JOIN transactions t ON t.player_id = p.id
       WHERE p.id = $1
       GROUP BY p.id, p.balance_coins, p.balance_keys
       HAVING p.balance_coins <> SUM(t.delta_coins) OR p.balance_keys <> SUM(t.delta_keys)`,
      [playerId],
    );
  }

  async function openCase() {
    return request(app.getHttpServer())
      .post('/api/cases/starter-chest/open')
      .set('Authorization', `Bearer ${token}`)
      .send({});
  }

  async function uniqueCardCount(): Promise<number> {
    const rows: Array<{ count: string }> = await dataSource.query(
      `SELECT COUNT(DISTINCT card_id)::int AS count FROM player_cards
       WHERE player_id = $1 AND sold_at IS NULL`,
      [playerId],
    );
    return Number(rows[0]?.count ?? 0);
  }

  describe('GET /api/me/milestones', () => {
    it('reports the whole ladder, unearned, for a fresh player — and awards nothing', async () => {
      await resetPlayerState(1_000_000, 5_000, []);
      const txCountBefore = await dataSource.query(
        'SELECT COUNT(*)::int AS count FROM transactions WHERE player_id = $1',
        [playerId],
      );

      const res = await request(app.getHttpServer())
        .get('/api/me/milestones')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.ownedUniqueCards).toBe(0);
      expect(res.body.tiers).toHaveLength(MILESTONE_LADDER.length);
      for (const tier of res.body.tiers) {
        expect(tier.earned).toBe(false);
        expect(tier.awardedAt).toBeNull();
      }

      // A GET must never write to the ledger.
      const txCountAfter = await dataSource.query(
        'SELECT COUNT(*)::int AS count FROM transactions WHERE player_id = $1',
        [playerId],
      );
      expect(txCountAfter[0].count).toBe(txCountBefore[0].count);

      const milestoneRows = await dataSource.query(
        'SELECT * FROM player_milestones WHERE player_id = $1',
        [playerId],
      );
      expect(milestoneRows).toEqual([]);
    });

    it('reflects an earned tier with its awardedAt timestamp', async () => {
      await resetPlayerState(1_000_000, 5_000, approvedCardIds.slice(0, 10));

      // Any economy action re-checks milestones; the daily bonus is the
      // cheapest one that never risks touching player_cards itself.
      const claim = await request(app.getHttpServer())
        .post('/api/me/daily-bonus')
        .set('Authorization', `Bearer ${token}`)
        .send({});
      expect(claim.status).toBe(200);

      const res = await request(app.getHttpServer())
        .get('/api/me/milestones')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.ownedUniqueCards).toBe(10);

      const tier10 = res.body.tiers.find((t: { key: string }) => t.key === 'unique_10');
      expect(tier10.earned).toBe(true);
      expect(typeof tier10.awardedAt).toBe('string');

      const tier25 = res.body.tiers.find((t: { key: string }) => t.key === 'unique_25');
      expect(tier25.earned).toBe(false);
      expect(tier25.awardedAt).toBeNull();
    });
  });

  describe('MilestoneService.checkAndAward wiring in DropsService.openCase', () => {
    let spy: jest.SpyInstance;

    beforeEach(() => {
      const milestoneService = app.get(MilestoneService);
      spy = jest.spyOn(milestoneService, 'checkAndAward');
    });

    afterEach(() => {
      spy.mockRestore();
    });

    it('a duplicate drop skips the milestone path entirely', async () => {
      // Own every approved card in the pool, so the very next drop is
      // GUARANTEED to be a duplicate (copies > 1) — no reliance on RNG luck.
      await resetPlayerState(1_000_000, 5_000, approvedCardIds);
      spy.mockClear();

      const res = await openCase();
      expect(res.status).toBe(200);
      expect(res.body.isDuplicate).toBe(true);

      expect(spy).not.toHaveBeenCalled();
    });

    it('a new-unique-card drop DOES call checkAndAward', async () => {
      // Own nothing — the very first drop is guaranteed new.
      await resetPlayerState(1_000_000, 5_000, []);
      spy.mockClear();

      const res = await openCase();
      expect(res.status).toBe(200);
      expect(res.body.isDuplicate).toBe(false);
      expect(res.body.copies).toBe(1);

      expect(spy).toHaveBeenCalledTimes(1);
    });
  });

  it('crossing unique_10 pays the reward, writes one ledger row and one player_milestones row', async () => {
    // One card short of the threshold.
    await resetPlayerState(50_000, 500, approvedCardIds.slice(0, 9));
    expect(await uniqueCardCount()).toBe(9);

    // Open until a genuinely new (10th) unique card lands. Bounded — a
    // pathological RNG streak of nothing-but-duplicates-of-the-9-owned-cards
    // must not hang the suite.
    let crossed = false;
    for (let i = 0; i < 100 && !crossed; i++) {
      await openCase();
      crossed = (await uniqueCardCount()) >= 10;
    }
    expect(crossed).toBe(true);

    const milestoneRows = await dataSource.query(
      'SELECT * FROM player_milestones WHERE player_id = $1',
      [playerId],
    );
    expect(milestoneRows.length).toBe(1);
    expect(milestoneRows[0].milestone_key).toBe('unique_10');
    expect(milestoneRows[0].transaction_id).not.toBeNull();

    const milestoneTxs = await dataSource.query(
      "SELECT * FROM transactions WHERE player_id = $1 AND type = 'milestone'",
      [playerId],
    );
    expect(milestoneTxs.length).toBe(1);
    expect(Number(milestoneTxs[0].delta_coins)).toBe(TIER_10_REWARD.coins);
    expect(Number(milestoneTxs[0].delta_keys)).toBe(TIER_10_REWARD.keys);
    expect(milestoneTxs[0].id).toBe(milestoneRows[0].transaction_id);

    const violations = await ledgerInvariantViolations();
    expect(violations).toEqual([]);
  });

  it('an already-awarded key is never awarded twice, even across several more opens', async () => {
    await resetPlayerState(50_000, 500, approvedCardIds.slice(0, 10));
    // Pre-award unique_10 directly, exactly as the real flow would have left it.
    await dataSource.query(
      `INSERT INTO player_milestones (player_id, milestone_key, transaction_id) VALUES ($1, 'unique_10', NULL)`,
      [playerId],
    );

    // A handful of further opens — comfortably short of unique_25 given only
    // 60 cards exist in the pool at all, so tier 2 cannot be reached here.
    for (let i = 0; i < 5; i++) {
      await openCase();
    }
    expect(await uniqueCardCount()).toBeLessThan(25);

    const milestoneRows = await dataSource.query(
      "SELECT * FROM player_milestones WHERE player_id = $1 AND milestone_key = 'unique_10'",
      [playerId],
    );
    expect(milestoneRows.length).toBe(1);

    const milestoneTxs = await dataSource.query(
      "SELECT * FROM transactions WHERE player_id = $1 AND type = 'milestone'",
      [playerId],
    );
    expect(milestoneTxs.length).toBe(0); // this test never let the real award happen
  });

  describe('MANDATORY: concurrency — one card short of unique_10, then N parallel opens', () => {
    const PARALLEL_OPENS = 15;

    it(`awards unique_10 exactly once across ${PARALLEL_OPENS} simultaneous requests`, async () => {
      await resetPlayerState(1_000_000, 5_000, approvedCardIds.slice(0, 9));
      expect(await uniqueCardCount()).toBe(9);

      // At most 9 + PARALLEL_OPENS = 24 unique cards can result — safely
      // below the unique_25 threshold, so exactly one milestone tier can
      // ever be crossed by this batch.
      const url = `${baseUrl}/api/cases/starter-chest/open`;
      const fetchHeaders = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      };

      // All requests are created synchronously (before any is awaited) so
      // they genuinely overlap on the wire — same technique as
      // open-case.e2e-spec.ts's mandatory concurrency test.
      const responses = await Promise.all(
        Array.from({ length: PARALLEL_OPENS }, () =>
          fetch(url, { method: 'POST', headers: fetchHeaders, body: '{}' }),
        ),
      );

      for (const res of responses) {
        expect(res.status).toBe(200);
      }

      const milestoneRows = await dataSource.query(
        "SELECT * FROM player_milestones WHERE player_id = $1 AND milestone_key = 'unique_10'",
        [playerId],
      );
      expect(milestoneRows.length).toBe(1);

      const milestoneTxs = await dataSource.query(
        "SELECT * FROM transactions WHERE player_id = $1 AND type = 'milestone'",
        [playerId],
      );
      expect(milestoneTxs.length).toBe(1);
      expect(Number(milestoneTxs[0].delta_coins)).toBe(TIER_10_REWARD.coins);

      const violations = await ledgerInvariantViolations();
      expect(violations).toEqual([]);
    });
  });
});
