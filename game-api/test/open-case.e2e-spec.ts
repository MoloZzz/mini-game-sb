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
 * Runs against the isolated `cardgame_test` database (same docker Postgres
 * instance on 5433, separate database — see test/env.setup.ts), never the
 * dev database that holds real approved cards and player history.
 * Every test restores the player's balance/pity and wipes the rows it created
 * in `afterEach`, so `read-endpoints.e2e-spec.ts` (which asserts balance ===
 * 1000, casesOpened === 0) keeps passing regardless of run order. `npm run
 * test:e2e` runs `--runInBand`, so these resets are never racing another
 * suite's assertions.
 *
 * `POST /cases/:slug/open` sits behind the global `JwtAuthGuard` now, so
 * this suite registers its own player via `auth.helper.ts` instead of the
 * seeded 'Molo' row — that also removes any dependency on seed state/order.
 * The player is deleted again in `afterAll`; `resetPlayerState` below only
 * ever touches this suite's own fixture player.
 */
describe('POST /api/cases/:slug/open (e2e)', () => {
  let app: NestExpressApplication;
  let dataSource: DataSource;
  let playerId: string;
  let token: string;
  let staticBaseUrl: string;
  let baseUrl: string;

  const EMAIL_PREFIX = 'test-open-case';
  const ORIGINAL_BALANCE_COINS = 1000;
  const ORIGINAL_BALANCE_KEYS = 5;
  const ORIGINAL_PITY = 0;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication<NestExpressApplication>();

    // Mirror main.ts exactly so paths/behavior match production.
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
    staticBaseUrl = configService.get('staticBaseUrl', { infer: true });

    // Listen on a real ephemeral port (not just app.init()) so the mandatory
    // concurrency test can fire two genuinely overlapping raw HTTP requests
    // instead of relying on supertest, which may serialize same-app calls.
    await app.listen(0);
    const address = app.getHttpServer().address();
    const port = typeof address === 'object' && address !== null ? address.port : 0;
    baseUrl = `http://127.0.0.1:${port}`;

    dataSource = app.get(getDataSourceToken());

    // Belt-and-suspenders: wipe any leftover fixture player from a
    // previously-crashed run before creating a fresh one.
    await deleteTestPlayers(dataSource, EMAIL_PREFIX);
    const account = await createTestPlayer(app, { emailPrefix: EMAIL_PREFIX });
    playerId = account.playerId;
    token = account.token;

    await resetPlayerState(ORIGINAL_BALANCE_COINS, ORIGINAL_BALANCE_KEYS, ORIGINAL_PITY);
  });

  /**
   * Wipes every row this suite could have created, then re-baselines BOTH
   * the player row AND the ledger to `(coins, keys, pity)` in one shot via a
   * single synthetic `initial_grant` transaction. Re-baselining the ledger
   * (not just the player row) is essential: the mandatory concurrency test
   * needs to force `balance_coins` to exactly 100 before each iteration, and
   * doing that via a bare `UPDATE players` without a matching transactions
   * row would make `SUM(delta_coins) <> balance_coins` a self-inflicted
   * artifact of test setup, not a real bug in the app under test.
   */
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
      });
      await manager.query(
        `INSERT INTO transactions (player_id, type, delta_coins, delta_keys, ref_type, ref_id)
         VALUES ($1, 'initial_grant', $2, $3, 'e2e-test-reset', NULL)`,
        [playerId, coins, keys],
      );
    });
  }

  afterEach(async () => {
    await resetPlayerState(ORIGINAL_BALANCE_COINS, ORIGINAL_BALANCE_KEYS, ORIGINAL_PITY);
  });

  afterAll(async () => {
    await deleteTestPlayers(dataSource, EMAIL_PREFIX);
    await app.close();
  });

  async function ledgerInvariantViolations(): Promise<unknown[]> {
    return dataSource.query(
      `SELECT p.id FROM players p JOIN transactions t ON t.player_id = p.id
       GROUP BY p.id, p.balance_coins HAVING p.balance_coins <> SUM(t.delta_coins)`,
    );
  }

  it('happy path: opens starter-chest, returns a well-formed reel, debits coins, writes ledger + inventory rows', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/cases/starter-chest/open')
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(200);
    const body = res.body;

    expect(Array.isArray(body.reel)).toBe(true);
    expect(body.reel.length).toBe(60);
    expect(body.winningIndex).toBe(55);
    expect(body.reel[55].id).toBe(body.wonCard.id);
    for (const tile of body.reel) {
      expect(typeof tile.thumbUrl).toBe('string');
      expect(tile.thumbUrl.startsWith(staticBaseUrl)).toBe(true);
    }

    expect(body.balance.coins).toBe(900); // 1000 - 100
    expect(body.balance.keys).toBe(5);
    expect(body.copies).toBe(1);
    expect(body.isDuplicate).toBe(false);

    // Direct DB checks.
    const openings = await dataSource.query('SELECT * FROM case_openings');
    expect(openings.length).toBe(1);
    expect(openings[0].id).toBe(body.dropId);
    expect(openings[0].won_card_id).toBe(body.wonCard.id);

    const playerCards = await dataSource.query('SELECT * FROM player_cards');
    expect(playerCards.length).toBe(1);
    expect(playerCards[0].card_id).toBe(body.wonCard.id);
    expect(playerCards[0].drop_id).toBe(body.dropId);

    const transactions = await dataSource.query(
      "SELECT * FROM transactions WHERE type = 'case_open'",
    );
    expect(transactions.length).toBe(1);
    expect(Number(transactions[0].delta_coins)).toBe(-100);
    expect(Number(transactions[0].delta_keys)).toBe(0);

    // Ledger invariant: SUM(delta_coins) == players.balance_coins, for every player.
    const violations = await ledgerInvariantViolations();
    expect(violations.length).toBe(0);
  });

  it('404: unknown case slug returns CASE_NOT_FOUND', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/cases/does-not-exist/open')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('CASE_NOT_FOUND');
  });

  it('402: insufficient coins returns INSUFFICIENT_FUNDS with need/have', async () => {
    await resetPlayerState(50, ORIGINAL_BALANCE_KEYS, ORIGINAL_PITY);

    const res = await request(app.getHttpServer())
      .post('/api/cases/starter-chest/open')
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(402);
    expect(res.body.code).toBe('INSUFFICIENT_FUNDS');
    expect(res.body.need.coins).toBe(100);
    expect(res.body.have.coins).toBe(50);
  });

  it('key-priced case: opening arcane-reliquary debits 1 key and writes delta_keys = -1, delta_coins = 0', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/cases/arcane-reliquary/open')
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.balance.keys).toBe(4); // 5 - 1
    expect(res.body.balance.coins).toBe(1000);

    const transactions = await dataSource.query(
      "SELECT * FROM transactions WHERE type = 'case_open'",
    );
    expect(transactions.length).toBe(1);
    expect(Number(transactions[0].delta_keys)).toBe(-1);
    expect(Number(transactions[0].delta_coins)).toBe(0);

    const violations = await ledgerInvariantViolations();
    expect(violations.length).toBe(0);
  });

  it('idempotency: two POSTs with the same Idempotency-Key charge once and return the same dropId', async () => {
    const idempotencyKey = 'e2e-test-idem-key-1';

    const res1 = await request(app.getHttpServer())
      .post('/api/cases/starter-chest/open')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', idempotencyKey)
      .send({});
    expect(res1.status).toBe(200);

    const res2 = await request(app.getHttpServer())
      .post('/api/cases/starter-chest/open')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', idempotencyKey)
      .send({});
    expect(res2.status).toBe(200);

    expect(res2.body.dropId).toBe(res1.body.dropId);
    expect(res2.body.balance.coins).toBe(900); // charged exactly once

    const openings = await dataSource.query(
      'SELECT * FROM case_openings WHERE idempotency_key = $1',
      [idempotencyKey],
    );
    expect(openings.length).toBe(1);

    const player = await dataSource
      .getRepository(PlayerEntity)
      .findOneOrFail({ where: { id: playerId } });
    expect(player.balanceCoins).toBe(900);

    const violations = await ledgerInvariantViolations();
    expect(violations.length).toBe(0);
  });

  describe('MANDATORY: concurrency — two simultaneous opens with funds for exactly one', () => {
    const ITERATIONS = 20;

    it(`runs ${ITERATIONS} times without flaking`, async () => {
      for (let iteration = 1; iteration <= ITERATIONS; iteration++) {
        // Reset to a clean slate for this iteration (afterEach only runs
        // between `it` blocks, not between loop iterations).
        await resetPlayerState(100, ORIGINAL_BALANCE_KEYS, 0);

        // Both fetch() calls are created synchronously (before either is
        // awaited) so the requests genuinely overlap on the wire, bypassing
        // supertest's per-call ephemeral-server behavior.
        const url = `${baseUrl}/api/cases/starter-chest/open`;
        const fetchHeaders = {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        };
        const [res1, res2] = await Promise.all([
          fetch(url, { method: 'POST', headers: fetchHeaders, body: '{}' }),
          fetch(url, { method: 'POST', headers: fetchHeaders, body: '{}' }),
        ]);

        const statuses = [res1.status, res2.status].sort();
        expect(statuses).toEqual([200, 402]);

        const bodies = await Promise.all([res1.json(), res2.json()]);
        const failed = bodies.find((b, i) => [res1.status, res2.status][i] === 402);
        expect(failed?.code).toBe('INSUFFICIENT_FUNDS');

        const player = await dataSource
          .getRepository(PlayerEntity)
          .findOneOrFail({ where: { id: playerId } });
        expect(player.balanceCoins).toBe(0);

        const openings = await dataSource.query('SELECT * FROM case_openings');
        expect(openings.length).toBe(1);

        const playerCards = await dataSource.query('SELECT * FROM player_cards');
        expect(playerCards.length).toBe(1);

        const violations = await ledgerInvariantViolations();
        expect(violations.length).toBe(0);
      }
    });
  });
});
