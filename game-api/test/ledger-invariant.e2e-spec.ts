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

/**
 * THE point of stage A7: after a randomized sequence of ~200 economy
 * operations (case opens, sells, daily-bonus claims), `SUM(delta_coins) ==
 * players.balance_coins` and the same for keys must hold for every player.
 * Runs against the real database, `--runInBand` (see jest.e2e.config.ts), so
 * there is no other writer racing this suite.
 */
describe('Ledger invariant under randomized load (e2e)', () => {
  let app: NestExpressApplication;
  let dataSource: DataSource;
  let playerId: string;

  const ORIGINAL_BALANCE_COINS = 1000;
  const ORIGINAL_BALANCE_KEYS = 5;
  const ORIGINAL_PITY = 0;

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

    const player = await dataSource
      .getRepository(PlayerEntity)
      .findOneOrFail({ where: { displayName: 'Molo' } });
    playerId = player.id;

    // Start from a large balance WITH a matching ledger row, so the
    // invariant already holds before the randomized sequence begins.
    await resetPlayerState(START_COINS, START_KEYS, 0);
  });

  async function resetPlayerState(coins: number, keys: number, pity: number): Promise<void> {
    await dataSource.query('DELETE FROM player_cards');
    await dataSource.query('DELETE FROM case_openings');
    await dataSource.query('DELETE FROM transactions');
    await dataSource.getRepository(PlayerEntity).update(playerId, {
      balanceCoins: coins,
      balanceKeys: keys,
      pityCounter: pity,
      lastDailyClaimAt: null,
    });
    await dataSource.query(
      `INSERT INTO transactions (player_id, type, delta_coins, delta_keys, ref_type, ref_id)
       VALUES ($1, 'initial_grant', $2, $3, 'e2e-test-reset', NULL)`,
      [playerId, coins, keys],
    );
  }

  afterAll(async () => {
    // Restore the shared baseline exactly like every other e2e suite.
    await resetPlayerState(ORIGINAL_BALANCE_COINS, ORIGINAL_BALANCE_KEYS, ORIGINAL_PITY);
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

  type Op = 'open' | 'sell' | 'daily';

  /** crypto.randomInt only (never Math.random) — weighted: opens are the bulk of activity. */
  function pickOp(): Op {
    const roll = randomInt(0, 100);
    if (roll < 60) return 'open';
    if (roll < 90) return 'sell';
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
        dailyAttempted: 0,
        dailySucceeded: 0,
        daily409: 0,
      };

      for (let i = 0; i < OPERATIONS; i++) {
        const op = pickOp();

        if (op === 'open') {
          tallies.openAttempted++;
          const slug = CASE_SLUGS[randomInt(0, CASE_SLUGS.length)];
          const res = await request(app.getHttpServer()).post(`/api/cases/${slug}/open`).send({});
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
            .send({});
          if (res.status === 200) tallies.sellSucceeded++;
          else if (res.status === 409) tallies.sell409++;
          else {
            throw new Error(`Unexpected sell status ${res.status}: ${JSON.stringify(res.body)}`);
          }
        } else {
          tallies.dailyAttempted++;
          const res = await request(app.getHttpServer()).post('/api/me/daily-bonus').send({});
          if (res.status === 200) tallies.dailySucceeded++;
          else if (res.status === 409) tallies.daily409++;
          else {
            throw new Error(
              `Unexpected daily-bonus status ${res.status}: ${JSON.stringify(res.body)}`,
            );
          }
        }
      }

      // eslint-disable-next-line no-console
      console.log('Ledger invariant test tallies:', JSON.stringify(tallies, null, 2));

      const totalAttempted =
        tallies.openAttempted + tallies.sellAttempted + tallies.dailyAttempted;
      expect(totalAttempted).toBe(OPERATIONS);
      expect(tallies.openSucceeded).toBeGreaterThanOrEqual(50);
      expect(tallies.sellSucceeded).toBeGreaterThanOrEqual(5);

      const coinViolations = await coinInvariantViolations();
      expect(coinViolations).toEqual([]);

      const keyViolations = await keyInvariantViolations();
      expect(keyViolations).toEqual([]);
    },
    300_000,
  );
});
