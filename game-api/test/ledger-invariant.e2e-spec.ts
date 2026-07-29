import { randomInt } from 'crypto';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { getDataSourceToken } from '@nestjs/typeorm';
import request from 'supertest';
import type { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import type { AppConfig } from '../src/config/configuration';
import { PlayerEntity } from '../src/entities';
import { createTestPlayer, deleteTestPlayers } from './auth.helper';

/**
 * THE point of stage A7: after a randomized sequence of ~200 economy
 * operations (case opens, sells, daily-bonus claims), `SUM(delta_coins) ==
 * players.balance_coins` and the same for keys must hold for every player.
 * Runs against the isolated `cardgame_test` database (see test/env.setup.ts),
 * `--runInBand` (see jest.e2e.config.ts), so there is no other writer racing
 * this suite.
 *
 * Every economy route sits behind the global `JwtAuthGuard` now, so this
 * suite registers its own player via `auth.helper.ts` instead of looking up
 * the seeded 'Molo' row — that also removes this suite's dependency on seed
 * state. The player is deleted again in `afterAll`.
 */
describe('Ledger invariant under randomized load (e2e)', () => {
  let app: NestExpressApplication;
  let dataSource: DataSource;
  let playerId: string;
  let token: string;

  const EMAIL_PREFIX = 'test-ledger-invariant';

  // Large enough that ~200 randomized ops rarely stall out on 402s.
  const START_COINS = 500_000;
  const START_KEYS = 2_000;

  const CASE_SLUGS = ['starter-chest', 'ember-vault', 'arcane-reliquary'];
  const OPERATIONS = 200;

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

    await app.init();

    dataSource = app.get(getDataSourceToken());

    await deleteTestPlayers(dataSource, EMAIL_PREFIX);
    const account = await createTestPlayer(app, { emailPrefix: EMAIL_PREFIX });
    playerId = account.playerId;
    token = account.token;

    // Start from a large balance WITH a matching ledger row, so the
    // invariant already holds before the randomized sequence begins.
    await resetPlayerState(START_COINS, START_KEYS, 0);
  });

  // Wrapped in a single `dataSource.transaction()` — with the deferred
  // ledger-invariant constraint trigger live on `players` (see
  // AddLedgerInvariantTrigger1785200000002), running these as separate
  // implicit transactions would let the `UPDATE players` commit be checked
  // against a ledger the preceding `DELETE FROM transactions` had just
  // emptied. One transaction means the deferred check only ever sees the
  // final, consistent state at COMMIT.
  async function resetPlayerState(coins: number, keys: number, pity: number): Promise<void> {
    await dataSource.transaction(async (manager) => {
      await manager.query('DELETE FROM player_cards');
      await manager.query('DELETE FROM case_openings');
      await manager.query('DELETE FROM transactions');
      await manager.getRepository(PlayerEntity).update(playerId, {
        balanceCoins: coins,
        balanceKeys: keys,
        pityCounter: pity,
        lastDailyClaimAt: null,
      });
      await manager.query(
        `INSERT INTO transactions (player_id, type, delta_coins, delta_keys, ref_type, ref_id)
         VALUES ($1, 'initial_grant', $2, $3, 'e2e-test-reset', NULL)`,
        [playerId, coins, keys],
      );
    });
  }

  afterAll(async () => {
    // This suite's player is its own fixture (not the shared 'Molo' row),
    // so cleanup is a straight delete rather than a balance restore —
    // cascades to its transactions/player_cards/case_openings.
    await deleteTestPlayers(dataSource, EMAIL_PREFIX);
    await app.close();
  });

  async function coinInvariantViolations(): Promise<unknown[]> {
    return dataSource.query(
      `SELECT p.id, p.balance_coins, SUM(t.delta_coins) AS ledger_sum
       FROM players p JOIN transactions t ON t.player_id = p.id
       GROUP BY p.id, p.balance_coins
       HAVING p.balance_coins <> SUM(t.delta_coins)`,
    );
  }

  async function keyInvariantViolations(): Promise<unknown[]> {
    return dataSource.query(
      `SELECT p.id, p.balance_keys, SUM(t.delta_keys) AS ledger_sum
       FROM players p JOIN transactions t ON t.player_id = p.id
       GROUP BY p.id, p.balance_keys
       HAVING p.balance_keys <> SUM(t.delta_keys)`,
    );
  }

  type Op = 'open' | 'sell' | 'bulkSell' | 'daily';

  /**
   * crypto.randomInt only (never Math.random) — weighted: opens are the bulk
   * of activity. `bulkSell` (mode: 'all_duplicates') shares its 10-point
   * slice with what used to be part of `sell`'s share, so `open`'s share is
   * unchanged and `sell` gives up 10 points to it.
   */
  function pickOp(): Op {
    const roll = randomInt(0, 100);
    if (roll < 60) return 'open';
    if (roll < 80) return 'sell';
    if (roll < 90) return 'bulkSell';
    return 'daily';
  }

  it(
    `runs ${OPERATIONS} randomized operations and preserves SUM(delta_coins) == balance_coins and SUM(delta_keys) == balance_keys`,
    async () => {
      const tallies = {
        openAttempted: 0,
        openSucceeded: 0,
        open402: 0,
        open409: 0,
        sellAttempted: 0,
        sellSucceeded: 0,
        sellNoCandidate: 0,
        sell409: 0,
        bulkSellAttempted: 0,
        bulkSellSucceeded: 0,
        bulkSellNoop: 0,
        dailyAttempted: 0,
        dailySucceeded: 0,
        daily409: 0,
      };

      for (let i = 0; i < OPERATIONS; i++) {
        const op = pickOp();

        if (op === 'open') {
          tallies.openAttempted++;
          const slug = CASE_SLUGS[randomInt(0, CASE_SLUGS.length)];
          const res = await request(app.getHttpServer())
            .post(`/api/cases/${slug}/open`)
            .set('Authorization', `Bearer ${token}`)
            .send({});
          if (res.status === 200) tallies.openSucceeded++;
          else if (res.status === 402) tallies.open402++;
          else if (res.status === 409) tallies.open409++;
          else {
            throw new Error(
              `Unexpected open-case status ${res.status}: ${JSON.stringify(res.body)}`,
            );
          }
        } else if (op === 'sell') {
          tallies.sellAttempted++;
          const candidates: Array<{ instance_id: string }> = await dataSource.query(
            `SELECT (array_agg(pc.id ORDER BY pc.acquired_at ASC, pc.id ASC))[1] AS instance_id
             FROM player_cards pc
             WHERE pc.player_id = $1 AND pc.sold_at IS NULL
             GROUP BY pc.card_id
             HAVING COUNT(*) > 1`,
            [playerId],
          );
          if (candidates.length === 0) {
            tallies.sellNoCandidate++;
            continue;
          }
          const chosen = candidates[randomInt(0, candidates.length)];
          const res = await request(app.getHttpServer())
            .post(`/api/me/inventory/${chosen.instance_id}/sell`)
            .set('Authorization', `Bearer ${token}`)
            .send({});
          if (res.status === 200) tallies.sellSucceeded++;
          else if (res.status === 409) tallies.sell409++;
          else {
            throw new Error(`Unexpected sell status ${res.status}: ${JSON.stringify(res.body)}`);
          }
        } else if (op === 'bulkSell') {
          tallies.bulkSellAttempted++;
          // No candidate query needed: mode 'all_duplicates' never has a
          // last-copy 409 to dodge (see sellBulk's comment on why the rule
          // holds by construction) — with nothing to sell it just returns
          // soldCount: 0.
          const res = await request(app.getHttpServer())
            .post('/api/me/inventory/sell-bulk')
            .set('Authorization', `Bearer ${token}`)
            .send({ mode: 'all_duplicates' });
          if (res.status === 200) {
            tallies.bulkSellSucceeded++;
            if (res.body.soldCount === 0) tallies.bulkSellNoop++;
          } else {
            throw new Error(
              `Unexpected bulk-sell status ${res.status}: ${JSON.stringify(res.body)}`,
            );
          }
        } else {
          tallies.dailyAttempted++;
          const res = await request(app.getHttpServer())
            .post('/api/me/daily-bonus')
            .set('Authorization', `Bearer ${token}`)
            .send({});
          if (res.status === 200) tallies.dailySucceeded++;
          else if (res.status === 409) tallies.daily409++;
          else {
            throw new Error(
              `Unexpected daily-bonus status ${res.status}: ${JSON.stringify(res.body)}`,
            );
          }
        }
      }

       
      console.log('Ledger invariant test tallies:', JSON.stringify(tallies, null, 2));

      const totalAttempted =
        tallies.openAttempted +
        tallies.sellAttempted +
        tallies.bulkSellAttempted +
        tallies.dailyAttempted;
      expect(totalAttempted).toBe(OPERATIONS);
      expect(tallies.openSucceeded).toBeGreaterThanOrEqual(50);
      expect(tallies.sellSucceeded).toBeGreaterThanOrEqual(5);
      // 'bulkSell' always returns 200 (soldCount: 0 is a valid no-op, not a
      // failure) — assert it actually ran, not that it found duplicates.
      expect(tallies.bulkSellAttempted).toBeGreaterThanOrEqual(1);

      const coinViolations = await coinInvariantViolations();
      expect(coinViolations).toEqual([]);

      const keyViolations = await keyInvariantViolations();
      expect(keyViolations).toEqual([]);
    },
    300_000,
  );

  /**
   * The whole point of `DEFERRABLE INITIALLY DEFERRED` (see
   * AddLedgerInvariantTrigger1785200000002) is that the constraint trigger
   * does NOT fire per-statement — it fires once, at COMMIT. This test proves
   * that distinction directly rather than just asserting "the transaction as
   * a whole rejects", which would pass even if the trigger fired immediately
   * (i.e. would pass for the wrong reason).
   *
   * Uses a raw `QueryRunner` transaction (not `dataSource.transaction()`,
   * which only exposes success/failure of the whole callback) so the UPDATE
   * and the COMMIT can be awaited — and asserted on — separately.
   */
  it('a raw UPDATE that breaks the invariant succeeds at statement time but fails at COMMIT', async () => {
    const queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Phase 1 — statement time. Must resolve, NOT throw: if the trigger
      // fired per-statement (i.e. INITIALLY IMMEDIATE, or not deferred at
      // all), this UPDATE would already be rejected here, and the test
      // below would never get the chance to show the COMMIT-time failure.
      await queryRunner.query(
        'UPDATE players SET balance_coins = balance_coins + 1 WHERE id = $1',
        [playerId],
      );

      // Phase 2 — commit time. Only now does the deferred constraint
      // trigger re-sum transactions.delta_coins for this player, find it no
      // longer matches the just-updated balance_coins, and reject.
      await expect(queryRunner.commitTransaction()).rejects.toThrow(
        /ledger invariant violated/i,
      );
    } finally {
      // Postgres ends the transaction outright when COMMIT itself is what
      // fails (unlike a normal mid-transaction statement error, which
      // leaves the session needing an explicit ROLLBACK) — so there is
      // normally nothing left to roll back here. Guard defensively anyway,
      // so a leftover transaction can never leak into the connection pool
      // for a later test if TypeORM's internal state disagrees.
      try {
        if (queryRunner.isTransactionActive) {
          await queryRunner.rollbackTransaction();
        }
      } catch {
        // Already ended server-side — nothing to roll back.
      }
      await queryRunner.release();
    }

    // The failed COMMIT means the +1 never landed — the invariant this
    // suite depends on for every other test still holds.
    const coinViolations = await coinInvariantViolations();
    expect(coinViolations).toEqual([]);
  });
});
