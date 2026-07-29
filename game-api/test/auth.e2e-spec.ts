import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { getDataSourceToken } from '@nestjs/typeorm';
import { INITIAL_GRANT } from '@card-game/shared-types';
import type { IngestCardInput } from '@card-game/shared-types';
import request from 'supertest';
import type { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import type { AppConfig } from '../src/config/configuration';
import { PlayerEntity } from '../src/entities';
import { createTestPlayer, deleteTestPlayers } from './auth.helper';

/**
 * Runs against the isolated `cardgame_test` database (see test/env.setup.ts),
 * never the dev database. Uses its own `test-auth-` email prefix (distinct
 * from every other suite's fixture prefix) so `deleteTestPlayers` in
 * `afterAll` cleans up exactly what this suite created and nothing else.
 *
 * This is the suite that proves real auth (part A) did not break ADR-008:
 * registration is now the only new balance-creating HTTP path, so its first
 * test — that it writes EXACTLY ONE `initial_grant` row and never diverges
 * from `SUM(delta_coins) == balance_coins` — is the single most important
 * assertion in this file.
 */
describe('Auth surface (e2e)', () => {
  let app: NestExpressApplication;
  let dataSource: DataSource;

  const EMAIL_PREFIX = 'test-auth';
  const CARD_SLUG_PREFIX = 'test-auth-ingest-';

  function makeCard(slugSuffix: string): IngestCardInput {
    return {
      slug: `${CARD_SLUG_PREFIX}${slugSuffix}`,
      imagePath: `cards/${CARD_SLUG_PREFIX}${slugSuffix}.png`,
      thumbPath: `thumbs/${CARD_SLUG_PREFIX}${slugSuffix}.webp`,
      suggestedRarity: 'common',
      archetype: 'beast',
      element: 'fire',
      genMeta: {
        model: 'sd15-test',
        prompt: 'a test card',
        negativePrompt: '',
        seed: 1,
        steps: 20,
        cfgScale: 7,
        sampler: 'euler_a',
        width: 512,
        height: 512,
        recipeId: 'test-recipe',
        generatedAt: new Date().toISOString(),
      },
    };
  }

  /** Mirrors main.ts's bootstrap exactly, matching every other e2e suite. */
  async function bootstrapApp(): Promise<NestExpressApplication> {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    const nestApp = moduleFixture.createNestApplication<NestExpressApplication>();
    const configService = nestApp.get(ConfigService<AppConfig, true>);
    nestApp.setGlobalPrefix('api');
    nestApp.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    nestApp.enableCors({ origin: true });
    const storageDir = configService.get('storageDir', { infer: true });
    nestApp.useStaticAssets(storageDir, { prefix: '/static' });

    await nestApp.init();
    return nestApp;
  }

  async function deleteTestCards(): Promise<void> {
    await dataSource.query('DELETE FROM cards WHERE slug LIKE $1', [`${CARD_SLUG_PREFIX}%`]);
  }

  beforeAll(async () => {
    app = await bootstrapApp();
    dataSource = app.get(getDataSourceToken());

    // Belt-and-suspenders: wipe any leftovers from a previously-crashed run.
    await deleteTestPlayers(dataSource, EMAIL_PREFIX);
    await deleteTestCards();
  });

  afterAll(async () => {
    await deleteTestPlayers(dataSource, EMAIL_PREFIX);
    await deleteTestCards();
    await app.close();
  });

  it('registration creates EXACTLY ONE initial_grant row and SUM(delta_coins) == balance_coins for the new player (ADR-008)', async () => {
    const account = await createTestPlayer(app, { emailPrefix: EMAIL_PREFIX });

    const txs: Array<{ type: string; delta_coins: string; delta_keys: string }> =
      await dataSource.query(
        'SELECT type, delta_coins, delta_keys FROM transactions WHERE player_id = $1',
        [account.playerId],
      );
    expect(txs.length).toBe(1);
    expect(txs[0]!.type).toBe('initial_grant');
    expect(Number(txs[0]!.delta_coins)).toBe(INITIAL_GRANT.coins);
    expect(Number(txs[0]!.delta_keys)).toBe(INITIAL_GRANT.keys);

    const player = await dataSource
      .getRepository(PlayerEntity)
      .findOneOrFail({ where: { id: account.playerId } });
    expect(player.balanceCoins).toBe(INITIAL_GRANT.coins);
    expect(player.balanceKeys).toBe(INITIAL_GRANT.keys);

    const sumRow: Array<{ sum: string | null }> = await dataSource.query(
      'SELECT SUM(delta_coins) AS sum FROM transactions WHERE player_id = $1',
      [account.playerId],
    );
    // The ledger invariant, spelled out for this one new player rather than
    // the whole table (see ledger-invariant.e2e-spec.ts for the table-wide
    // version): the sum this suite just wrote must equal the denormalized
    // balance cache exactly.
    expect(Number(sumRow[0]!.sum)).toBe(player.balanceCoins);
  });

  it('duplicate email -> 409 EMAIL_TAKEN, case-insensitively (the unique index is on lower(email))', async () => {
    const email = `${EMAIL_PREFIX}-dup-${Date.now()}@example.com`;

    const first = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ displayName: 'Dup Tester', email, password: 'correct-horse-battery-staple' });
    expect(first.status).toBe(201);

    const sameCase = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ displayName: 'Dup Tester Again', email, password: 'another-password-123' });
    expect(sameCase.status).toBe(409);
    expect(sameCase.body.code).toBe('EMAIL_TAKEN');

    const differentCase = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({
        displayName: 'Dup Tester Once More',
        email: email.toUpperCase(),
        password: 'yet-another-password-123',
      });
    expect(differentCase.status).toBe(409);
    expect(differentCase.body.code).toBe('EMAIL_TAKEN');
  });

  it('wrong password -> 401 INVALID_CREDENTIALS', async () => {
    const account = await createTestPlayer(app, { emailPrefix: EMAIL_PREFIX });

    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: account.email, password: 'definitely-the-wrong-password' });

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('INVALID_CREDENTIALS');
  });

  it('every /me-shaped route rejects a request with no token -> 401 UNAUTHORIZED', async () => {
    const randomUuid = '00000000-0000-4000-8000-000000000000';
    const routes: Array<{ method: 'get' | 'post'; path: string }> = [
      { method: 'get', path: '/api/auth/me' },
      { method: 'get', path: '/api/me' },
      { method: 'get', path: '/api/me/inventory' },
      { method: 'get', path: '/api/me/collection' },
      { method: 'get', path: '/api/me/drops' },
      { method: 'post', path: '/api/me/daily-bonus' },
      { method: 'post', path: `/api/me/inventory/${randomUuid}/sell` },
      { method: 'post', path: '/api/cases/starter-chest/open' },
    ];

    for (const route of routes) {
      const res = await request(app.getHttpServer())[route.method](route.path).send({});
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('UNAUTHORIZED');
    }
  });

  it('/admin/cards with a player (non-admin) token -> 403 FORBIDDEN', async () => {
    const player = await createTestPlayer(app, { emailPrefix: EMAIL_PREFIX });

    const res = await request(app.getHttpServer())
      .get('/api/admin/cards')
      .set('Authorization', `Bearer ${player.token}`);

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN');
  });

  it('POST /admin/cards/ingest with a valid X-Service-Token and NO JWT -> 200', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/admin/cards/ingest')
      .set('X-Service-Token', process.env.FORGE_SERVICE_TOKEN!)
      .send({ cards: [makeCard('valid-token')] });

    expect(res.status).toBe(200);
    expect(res.body.inserted).toBe(1);
  });

  it('POST /admin/cards/ingest with a wrong X-Service-Token -> rejected, never 2xx (fail-closed)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/admin/cards/ingest')
      .set('X-Service-Token', 'definitely-not-the-configured-token')
      .send({ cards: [makeCard('wrong-token')] });

    // The property under test is fail-closed, not the exact status code —
    // but ServiceTokenGuard is known to throw ForbiddenException, so assert
    // the concrete shape too.
    expect(res.status < 200 || res.status >= 300).toBe(true);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN');
  });

  it('POST /admin/cards/ingest rejected when FORGE_SERVICE_TOKEN is unset, regardless of header value (fail-closed)', async () => {
    // ConfigModule reads process.env exactly once, when the Nest module
    // graph is built — mutating process.env after `app` above already
    // booted has no effect on it. So proving the "unset" branch needs a
    // second, throwaway app built with the var deleted for its lifetime.
    const originalToken = process.env.FORGE_SERVICE_TOKEN;
    delete process.env.FORGE_SERVICE_TOKEN;

    let noTokenApp: NestExpressApplication | undefined;
    try {
      noTokenApp = await bootstrapApp();

      const res = await request(noTokenApp.getHttpServer())
        .post('/api/admin/cards/ingest')
        // Send the value that WOULD be valid if the env var were set, to
        // prove the guard doesn't fall back to some other truth source —
        // "unset" must reject every header value, no exceptions.
        .set('X-Service-Token', originalToken ?? 'irrelevant')
        .send({ cards: [makeCard('unset-token')] });

      expect(res.status < 200 || res.status >= 300).toBe(true);
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('FORBIDDEN');
    } finally {
      if (originalToken === undefined) delete process.env.FORGE_SERVICE_TOKEN;
      else process.env.FORGE_SERVICE_TOKEN = originalToken;
      if (noTokenApp) await noTokenApp.close();
    }
  });

  it('regression: raw INSERT INTO players(display_name) fails now that AddPlayerAuth dropped the balance defaults', async () => {
    // Before that migration, this exact INSERT silently succeeded and
    // minted 1000 coins + 5 keys with NO matching `transactions` row —
    // violating SUM(delta_coins) == balance_coins (ADR-008) from the moment
    // the row existed. The migration dropped both column DEFAULTs
    // specifically so a caller that forgets to set balances explicitly now
    // fails fast on NOT NULL instead of silently corrupting the ledger.
    //
    // Since AddLedgerInvariantTrigger1785200000002, this INSERT has TWO
    // independent reasons it could fail: (a) the NOT NULL violation this
    // test intends to prove, raised synchronously while the INSERT statement
    // itself is executing, and (b) the deferred constraint trigger, which
    // would only ever get a chance to fire — at COMMIT — if the row had
    // actually been inserted. Because (a) aborts the INSERT statement
    // itself, the row never exists for the AFTER INSERT trigger to see, so
    // (b) can never be the one that fires here — but a bare
    // `.rejects.toThrow()` can't tell the two apart and would pass either
    // way. Assert the concrete Postgres error (23502 = not_null_violation)
    // so this test fails loudly if that ever stops being the reason.
    await expect(
      dataSource.query('INSERT INTO players (display_name) VALUES ($1)', [
        'test-auth-regression-no-default',
      ]),
    ).rejects.toMatchObject({ code: '23502' });

    const rows = await dataSource.query('SELECT 1 FROM players WHERE display_name = $1', [
      'test-auth-regression-no-default',
    ]);
    expect(rows.length).toBe(0);
  });
});
