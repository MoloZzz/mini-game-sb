import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { getDataSourceToken } from '@nestjs/typeorm';
import { DAILY_BONUS, DAILY_BONUS_COOLDOWN_MS, RARITY_META } from '@card-game/shared-types';
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
 * Every test restores the player's balance/pity/daily-claim and wipes the
 * rows it created in `afterEach`, following the exact pattern of
 * `open-case.e2e-spec.ts` so `read-endpoints.e2e-spec.ts` keeps passing
 * regardless of run order. `npm run test:e2e` runs `--runInBand`.
 *
 * Every route here (`/me/inventory`, `/me/inventory/:id/sell`,
 * `/me/daily-bonus`, `/me/drops`, `/cases/:slug/open`) sits behind the
 * global `JwtAuthGuard` now, so this suite registers its own player via
 * `auth.helper.ts` instead of the seeded 'Molo' row and attaches its token
 * to every request; the player is deleted again in `afterAll`.
 */
describe('Inventory & economy (e2e)', () => {
  let app: NestExpressApplication;
  let dataSource: DataSource;
  let playerId: string;
  let token: string;
  let staticBaseUrl: string;

  const EMAIL_PREFIX = 'test-inventory-economy';
  const ORIGINAL_BALANCE_COINS = 1000;
  const ORIGINAL_BALANCE_KEYS = 5;
  const ORIGINAL_PITY = 0;

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
    staticBaseUrl = configService.get('staticBaseUrl', { infer: true });

    await app.init();

    dataSource = app.get(getDataSourceToken());

    await deleteTestPlayers(dataSource, EMAIL_PREFIX);
    const account = await createTestPlayer(app, { emailPrefix: EMAIL_PREFIX });
    playerId = account.playerId;
    token = account.token;

    await resetPlayerState(ORIGINAL_BALANCE_COINS, ORIGINAL_BALANCE_KEYS, ORIGINAL_PITY);
  });

  /**
   * Wipes every row this suite could have created, then re-baselines the
   * player AND the ledger in one shot via a single synthetic `initial_grant`
   * transaction — same rationale as `open-case.e2e-spec.ts`.
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
        lastDailyClaimAt: null,
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

  async function openCase(slug = 'starter-chest'): Promise<any> {
    const res = await request(app.getHttpServer())
      .post(`/api/cases/${slug}/open`)
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(200);
    return res.body;
  }

  /**
   * Opens `slug` repeatedly (funded generously first) until some card has
   * 2+ unsold copies, then returns that card's id. Bounded so a pathological
   * RNG streak can't hang the suite.
   */
  async function openUntilDuplicate(slug = 'starter-chest', maxAttempts = 150): Promise<string> {
    await resetPlayerState(200_000, 500, 0);
    for (let i = 0; i < maxAttempts; i++) {
      await openCase(slug);
      const rows: Array<{ card_id: string }> = await dataSource.query(
        `SELECT card_id FROM player_cards
         WHERE sold_at IS NULL
         GROUP BY card_id
         HAVING COUNT(*) >= 2
         LIMIT 1`,
      );
      if (rows.length > 0) return rows[0].card_id;
    }
    throw new Error(`No duplicate card accumulated after ${maxAttempts} opens of ${slug}`);
  }

  it('opens a case, then GET /api/me/inventory shows one group with copies=1, total=1, absolute imageUrl', async () => {
    const opened = await openCase();

    const res = await request(app.getHttpServer())
      .get('/api/me/inventory')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.items.length).toBe(1);

    const [group] = res.body.items;
    expect(group.copies).toBe(1);
    expect(group.card.id).toBe(opened.wonCard.id);
    expect(group.instanceId).toBeDefined();
    expect(typeof group.card.imageUrl).toBe('string');
    expect(group.card.imageUrl.startsWith(staticBaseUrl)).toBe(true);
  });

  it('selling the only copy is refused with 409 LAST_COPY', async () => {
    await openCase();

    const inv = await request(app.getHttpServer())
      .get('/api/me/inventory')
      .set('Authorization', `Bearer ${token}`);
    const instanceId = inv.body.items[0].instanceId;

    const res = await request(app.getHttpServer())
      .post(`/api/me/inventory/${instanceId}/sell`)
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('LAST_COPY');
  });

  it('selling a duplicate: 200, correct sellValue credited, ledger row written, sold_at set, copies drop by 1', async () => {
    const cardId = await openUntilDuplicate();

    const before = await request(app.getHttpServer())
      .get('/api/me/inventory?limit=100')
      .set('Authorization', `Bearer ${token}`);
    const group = before.body.items.find((it: any) => it.card.id === cardId);
    expect(group).toBeDefined();
    const copiesBefore = group.copies;
    expect(copiesBefore).toBeGreaterThanOrEqual(2);

    const sellValue = RARITY_META[group.card.rarity as keyof typeof RARITY_META].sellValue;

    const playerBefore = await dataSource
      .getRepository(PlayerEntity)
      .findOneOrFail({ where: { id: playerId } });

    const res = await request(app.getHttpServer())
      .post(`/api/me/inventory/${group.instanceId}/sell`)
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.gained.coins).toBe(sellValue);
    expect(res.body.balance.coins).toBe(playerBefore.balanceCoins + sellValue);
    expect(res.body.balance.keys).toBe(playerBefore.balanceKeys);

    const txs = await dataSource.query("SELECT * FROM transactions WHERE type = 'card_sell'");
    expect(txs.length).toBe(1);
    expect(Number(txs[0].delta_coins)).toBe(sellValue);
    expect(Number(txs[0].delta_keys)).toBe(0);
    expect(txs[0].ref_type).toBe('player_card');
    expect(txs[0].ref_id).toBe(group.instanceId);

    const soldRow = await dataSource.query('SELECT sold_at FROM player_cards WHERE id = $1', [
      group.instanceId,
    ]);
    expect(soldRow[0].sold_at).not.toBeNull();

    const after = await request(app.getHttpServer())
      .get('/api/me/inventory?limit=100')
      .set('Authorization', `Bearer ${token}`);
    const groupAfter = after.body.items.find((it: any) => it.card.id === cardId);
    expect(groupAfter.copies).toBe(copiesBefore - 1);
  });

  it('selling a random UUID -> 404 INSTANCE_NOT_FOUND; selling an already-sold instance -> 404', async () => {
    const randomUuid = '00000000-0000-4000-8000-000000000000';
    const res1 = await request(app.getHttpServer())
      .post(`/api/me/inventory/${randomUuid}/sell`)
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(res1.status).toBe(404);
    expect(res1.body.code).toBe('INSTANCE_NOT_FOUND');

    const cardId = await openUntilDuplicate();
    const inv = await request(app.getHttpServer())
      .get('/api/me/inventory?limit=100')
      .set('Authorization', `Bearer ${token}`);
    const group = inv.body.items.find((it: any) => it.card.id === cardId);

    const sellRes = await request(app.getHttpServer())
      .post(`/api/me/inventory/${group.instanceId}/sell`)
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(sellRes.status).toBe(200);

    const resAgain = await request(app.getHttpServer())
      .post(`/api/me/inventory/${group.instanceId}/sell`)
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(resAgain.status).toBe(404);
    expect(resAgain.body.code).toBe('INSTANCE_NOT_FOUND');
  });

  it('POST /api/me/daily-bonus: 200 with coins+keys credited and a ledger row, then 409 on immediate re-claim', async () => {
    const before = await dataSource
      .getRepository(PlayerEntity)
      .findOneOrFail({ where: { id: playerId } });

    const res = await request(app.getHttpServer())
      .post('/api/me/daily-bonus')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(200);
    expect(res.body.gained).toEqual(DAILY_BONUS);
    expect(res.body.balance.coins).toBe(before.balanceCoins + DAILY_BONUS.coins);
    expect(res.body.balance.keys).toBe(before.balanceKeys + DAILY_BONUS.keys);

    const expectedNextAvailableAt = Date.now() + DAILY_BONUS_COOLDOWN_MS;
    const actualNextAvailableAt = new Date(res.body.nextAvailableAt).getTime();
    expect(Math.abs(actualNextAvailableAt - expectedNextAvailableAt)).toBeLessThan(5000);

    const txs = await dataSource.query("SELECT * FROM transactions WHERE type = 'daily_bonus'");
    expect(txs.length).toBe(1);
    expect(Number(txs[0].delta_coins)).toBe(DAILY_BONUS.coins);
    expect(Number(txs[0].delta_keys)).toBe(DAILY_BONUS.keys);

    const res2 = await request(app.getHttpServer())
      .post('/api/me/daily-bonus')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(res2.status).toBe(409);
    expect(res2.body.code).toBe('DAILY_BONUS_NOT_READY');
    expect(res2.body.nextAvailableAt).toBeDefined();
  });

  it('GET /api/me/drops?limit=5 -> at most 5 items, newest first, each with a resolvable card.imageUrl', async () => {
    await resetPlayerState(10_000, 50, 0);
    for (let i = 0; i < 7; i++) {
      await openCase('starter-chest');
    }

    const res = await request(app.getHttpServer())
      .get('/api/me/drops?limit=5')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeLessThanOrEqual(5);

    const createdAts = res.body.map((item: any) => new Date(item.createdAt).getTime());
    const sorted = [...createdAts].sort((a, b) => b - a);
    expect(createdAts).toEqual(sorted);

    for (const item of res.body) {
      expect(typeof item.dropId).toBe('string');
      expect(typeof item.caseSlug).toBe('string');
      expect(typeof item.caseName).toBe('string');
      expect(item.card.imageUrl.startsWith(staticBaseUrl)).toBe(true);
    }

    // Strip only scheme+host (keep the `/static` prefix) — matches
    // read-endpoints.e2e-spec.ts's convention for resolving a served image.
    const imagePath: string = res.body[0].card.imageUrl.replace(/^https?:\/\/[^/]+/, '');
    const imageRes = await request(app.getHttpServer()).get(imagePath);
    expect(imageRes.status).toBe(200);
    expect(imageRes.headers['content-type']).toBe('image/png');
  });

  it('inventory filters (?rarity=) and sort (?sort=name_asc) behave correctly', async () => {
    await resetPlayerState(50_000, 200, 0);
    for (let i = 0; i < 30; i++) {
      await openCase('starter-chest');
    }

    const dbGroups: Array<{ rarity: string }> = await dataSource.query(
      `SELECT c.rarity FROM player_cards pc JOIN cards c ON c.id = pc.card_id
       WHERE pc.player_id = $1 AND pc.sold_at IS NULL
       GROUP BY c.id, c.rarity`,
      [playerId],
    );
    expect(dbGroups.length).toBeGreaterThan(0);
    const commonCount = dbGroups.filter((g) => g.rarity === 'common').length;
    expect(commonCount).toBeGreaterThan(0);

    const filtered = await request(app.getHttpServer())
      .get('/api/me/inventory?rarity=common&limit=100')
      .set('Authorization', `Bearer ${token}`);
    expect(filtered.status).toBe(200);
    expect(filtered.body.total).toBe(commonCount);
    for (const item of filtered.body.items) {
      expect(item.card.rarity).toBe('common');
    }

    const sorted = await request(app.getHttpServer())
      .get('/api/me/inventory?sort=name_asc&limit=100')
      .set('Authorization', `Bearer ${token}`);
    expect(sorted.status).toBe(200);
    const names = sorted.body.items.map((item: any) => item.card.name);
    const expectedNames = [...names].sort((a, b) => a.localeCompare(b));
    expect(names).toEqual(expectedNames);
  });
});
