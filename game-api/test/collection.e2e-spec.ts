import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { getDataSourceToken } from '@nestjs/typeorm';
import { RARITIES } from '@card-game/shared-types';
import type { IngestCardInput } from '@card-game/shared-types';
import request from 'supertest';
import type { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import type { AppConfig } from '../src/config/configuration';
import { createTestAdmin, createTestPlayer, deleteTestPlayers, type TestAccount } from './auth.helper';

/**
 * Runs against the isolated `cardgame_test` database (see test/env.setup.ts
 * and the header comment in test/admin.e2e-spec.ts) — never the dev
 * database. Baseline: 60 approved placeholder cards, 0 drafts. Uses its own
 * `test-collection-` slug prefix (distinct from admin.e2e-spec's
 * `test-ingest-`) so the two suites never collide when jest runs them
 * back-to-back with `--runInBand`. Ingest/review routes now require an admin
 * (`@Roles('admin')` + the global guards), `GET /api/me/collection` requires
 * any player token — both come from `auth.helper.ts`, namespaced under their
 * own `test-collection-auth-` email prefix and cleaned up in `afterAll`.
 */
describe('GET /api/me/collection (e2e)', () => {
  let app: NestExpressApplication;
  let dataSource: DataSource;
  let admin: TestAccount;
  let player: TestAccount;

  const SLUG_PREFIX = 'test-collection-';
  const EMAIL_PREFIX = 'test-collection-auth';

  function makeCard(slugSuffix: string, overrides: Partial<IngestCardInput> = {}): IngestCardInput {
    return {
      slug: `${SLUG_PREFIX}${slugSuffix}`,
      imagePath: `cards/${SLUG_PREFIX}${slugSuffix}.png`,
      thumbPath: `thumbs/${SLUG_PREFIX}${slugSuffix}.webp`,
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
      ...overrides,
    };
  }

  async function deleteTestCards(): Promise<void> {
    await dataSource.query('DELETE FROM cards WHERE slug LIKE $1', [`${SLUG_PREFIX}%`]);
  }

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

    // Belt-and-suspenders: wipe any leftovers from a previously-crashed run.
    await deleteTestCards();
    await deleteTestPlayers(dataSource, EMAIL_PREFIX);

    admin = await createTestAdmin(app, dataSource, { emailPrefix: EMAIL_PREFIX });
    player = await createTestPlayer(app, { emailPrefix: EMAIL_PREFIX });
  });

  afterAll(async () => {
    await deleteTestCards();
    await deleteTestPlayers(dataSource, EMAIL_PREFIX);

    const cardCounts: Array<{ status: string; count: string }> = await dataSource.query(
      'SELECT status, count(*) FROM cards GROUP BY status',
    );
    const approved = cardCounts.find((r) => r.status === 'approved');
    const draftRow = cardCounts.find((r) => r.status === 'draft');
    if (!approved || Number(approved.count) !== 60 || draftRow) {
      throw new Error(
        `DB not restored to baseline after collection.e2e-spec: ${JSON.stringify(cardCounts)}`,
      );
    }

    await app.close();
  });

  it('shape: total equals the sum of byRarity totals, and every rarity is present', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/me/collection')
      .set('Authorization', `Bearer ${player.token}`);

    expect(res.status).toBe(200);
    expect(typeof res.body.owned).toBe('number');
    expect(typeof res.body.total).toBe('number');

    let summedTotal = 0;
    for (const rarity of RARITIES) {
      const row = res.body.byRarity[rarity];
      expect(row).toBeDefined();
      expect(typeof row.owned).toBe('number');
      expect(typeof row.total).toBe('number');
      summedTotal += row.total;
    }
    expect(summedTotal).toBe(res.body.total);
  });

  it('baseline total is 60 (the seeded approved pool) — never a hardcoded pool constant', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/me/collection')
      .set('Authorization', `Bearer ${player.token}`);
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(60);
  });

  it('approving one more card moves the total from 60 to 61, without a restart or a wait for the memo TTL', async () => {
    const before = await request(app.getHttpServer())
      .get('/api/me/collection')
      .set('Authorization', `Bearer ${player.token}`);
    expect(before.body.total).toBe(60);
    const commonTotalBefore: number = before.body.byRarity.common.total;

    // Ingest as draft — must NOT move the total yet. Real card-forge uses
    // X-Service-Token, but an admin JWT is equally valid per ServiceTokenGuard;
    // using the admin token here keeps this suite to a single auth fixture.
    const ingestRes = await request(app.getHttpServer())
      .post('/api/admin/cards/ingest')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ cards: [makeCard('pool-truth', { suggestedRarity: 'common' })] });
    expect(ingestRes.body.inserted).toBe(1);

    const afterIngest = await request(app.getHttpServer())
      .get('/api/me/collection')
      .set('Authorization', `Bearer ${player.token}`);
    expect(afterIngest.body.total).toBe(60);

    const listRes = await request(app.getHttpServer())
      .get('/api/admin/cards?status=draft&limit=100')
      .set('Authorization', `Bearer ${admin.token}`);
    const target = listRes.body.items.find((i: { slug: string }) =>
      i.slug.endsWith('pool-truth'),
    );
    expect(target).toBeDefined();

    // Approve it — must invalidate PoolService's memo immediately.
    const patchRes = await request(app.getHttpServer())
      .patch(`/api/admin/cards/${target.id}`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ status: 'approved' });
    expect(patchRes.status).toBe(200);
    expect(patchRes.body.status).toBe('approved');

    const after = await request(app.getHttpServer())
      .get('/api/me/collection')
      .set('Authorization', `Bearer ${player.token}`);
    expect(after.status).toBe(200);
    expect(after.body.total).toBe(61);
    expect(after.body.byRarity.common.total).toBe(commonTotalBefore + 1);
    // Approving a card nobody owns must never move `owned`.
    expect(after.body.owned).toBe(before.body.owned);
  });
});
