import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { getDataSourceToken } from '@nestjs/typeorm';
import { RARITY_META } from '@card-game/shared-types';
import type { IngestCardInput } from '@card-game/shared-types';
import request from 'supertest';
import type { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import type { AppConfig } from '../src/config/configuration';
import { PlayerEntity } from '../src/entities';

/**
 * Runs against the REAL database (docker Postgres on 5433, see game-api/.env).
 * Every card this suite inserts uses a `test-ingest-` slug prefix, which is
 * how `afterAll` finds and deletes them to restore the exact baseline: 60
 * approved placeholder cards, 0 drafts, player at 1000 coins / 5 keys / pity
 * 0, 0 openings, 0 player_cards, 1 `initial_grant` transaction. See
 * `test/open-case.e2e-spec.ts` for the same reset-around-every-test pattern.
 */
describe('Admin surface (e2e)', () => {
  let app: NestExpressApplication;
  let dataSource: DataSource;

  const SLUG_PREFIX = 'test-ingest-';

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

    // Belt-and-suspenders: wipe any leftovers from a previously-crashed run
    // before asserting anything about counts.
    await deleteTestCards();
  });

  afterAll(async () => {
    await deleteTestCards();

    // Verify the restore, loudly.
    const cardCounts: Array<{ status: string; count: string }> = await dataSource.query(
      'SELECT status, count(*) FROM cards GROUP BY status',
    );
    const approved = cardCounts.find((r) => r.status === 'approved');
    const draftRow = cardCounts.find((r) => r.status === 'draft');
    if (!approved || Number(approved.count) !== 60 || draftRow) {
      throw new Error(
        `DB not restored to baseline after admin.e2e-spec: ${JSON.stringify(cardCounts)}`,
      );
    }

    const totalCards: Array<{ count: string }> = await dataSource.query(
      'SELECT count(*) FROM cards',
    );
    if (Number(totalCards[0]?.count) !== 60) {
      throw new Error(`Expected exactly 60 cards after restore, got ${totalCards[0]?.count}`);
    }

    const player = await dataSource
      .getRepository(PlayerEntity)
      .findOneOrFail({ where: { displayName: 'Molo' } });
    if (player.balanceCoins !== 1000 || player.balanceKeys !== 5 || player.pityCounter !== 0) {
      throw new Error(
        `Player baseline not intact: coins=${player.balanceCoins} keys=${player.balanceKeys} pity=${player.pityCounter}`,
      );
    }

    const openings: unknown[] = await dataSource.query('SELECT * FROM case_openings');
    const playerCards: unknown[] = await dataSource.query('SELECT * FROM player_cards');
    const transactions: Array<{ type: string }> = await dataSource.query(
      'SELECT * FROM transactions',
    );
    if (openings.length !== 0) throw new Error(`Expected 0 case_openings, got ${openings.length}`);
    if (playerCards.length !== 0)
      throw new Error(`Expected 0 player_cards, got ${playerCards.length}`);
    if (transactions.length !== 1 || transactions[0]?.type !== 'initial_grant') {
      throw new Error(`Expected exactly 1 initial_grant transaction, got ${JSON.stringify(transactions)}`);
    }

    await app.close();
  });

  it('1. ingest inserts drafts: POST 5 cards -> inserted 5, skipped 0', async () => {
    const cards = [1, 2, 3, 4, 5].map((n) => makeCard(`batch1-${n}`));

    const res = await request(app.getHttpServer()).post('/api/admin/cards/ingest').send({ cards });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ inserted: 5, skipped: 0, skippedSlugs: [] });

    const rows: Array<{ status: string; attack: number; defense: number; image_path: string }> =
      await dataSource.query('SELECT * FROM cards WHERE slug LIKE $1', [`${SLUG_PREFIX}batch1-%`]);
    expect(rows.length).toBe(5);
    for (const row of rows) {
      expect(row.status).toBe('draft');
      expect(Number(row.attack)).toBe(0);
      expect(Number(row.defense)).toBe(0);
      expect(row.image_path.startsWith('http')).toBe(false);
      expect(row.image_path.startsWith('/')).toBe(false);
    }
  });

  it('2. THE MANDATORY IDEMPOTENCY TEST: re-posting the same batch inserts nothing, then a mixed batch inserts only the new ones', async () => {
    const cards = [1, 2, 3, 4, 5].map((n) => makeCard(`batch1-${n}`));

    const totalBefore: Array<{ count: string }> = await dataSource.query('SELECT count(*) FROM cards');

    const res = await request(app.getHttpServer()).post('/api/admin/cards/ingest').send({ cards });

    expect(res.status).toBe(200);
    expect(res.body.inserted).toBe(0);
    expect(res.body.skipped).toBe(5);
    expect(new Set(res.body.skippedSlugs)).toEqual(new Set(cards.map((c) => c.slug)));

    const totalAfter: Array<{ count: string }> = await dataSource.query('SELECT count(*) FROM cards');
    expect(totalAfter[0]?.count).toBe(totalBefore[0]?.count);

    // Mixed batch: 3 of the original + 2 new.
    const mixed = [
      makeCard('batch1-1'),
      makeCard('batch1-2'),
      makeCard('batch1-3'),
      makeCard('batch2-new-1'),
      makeCard('batch2-new-2'),
    ];
    const mixedRes = await request(app.getHttpServer())
      .post('/api/admin/cards/ingest')
      .send({ cards: mixed });

    expect(mixedRes.status).toBe(200);
    expect(mixedRes.body.inserted).toBe(2);
    expect(mixedRes.body.skipped).toBe(3);
  });

  it('3. duplicate slug within a single batch: inserted 1, skipped 1', async () => {
    const dupSlug = 'batch3-dup';
    const cards = [makeCard(dupSlug), makeCard(dupSlug)];

    const res = await request(app.getHttpServer()).post('/api/admin/cards/ingest').send({ cards });

    expect(res.status).toBe(200);
    expect(res.body.inserted).toBe(1);
    expect(res.body.skipped).toBe(1);
    expect(res.body.skippedSlugs).toEqual([`${SLUG_PREFIX}${dupSlug}`]);
  });

  it('4. validation rejects absolute paths (http:// and leading slash) with 400', async () => {
    const httpRes = await request(app.getHttpServer())
      .post('/api/admin/cards/ingest')
      .send({ cards: [makeCard('bad-http', { imagePath: 'http://evil/x.png' })] });
    expect(httpRes.status).toBe(400);

    const slashRes = await request(app.getHttpServer())
      .post('/api/admin/cards/ingest')
      .send({ cards: [makeCard('bad-slash', { imagePath: '/abs/y.png' })] });
    expect(slashRes.status).toBe(400);

    // Neither invalid batch should have inserted anything.
    const rows = await dataSource.query('SELECT * FROM cards WHERE slug LIKE $1', [
      `${SLUG_PREFIX}bad-%`,
    ]);
    expect(rows.length).toBe(0);
  });

  it('5. review queue: GET /api/admin/cards (default) returns only drafts, with genMeta/status/setId/createdAt/imageUrl', async () => {
    const res = await request(app.getHttpServer()).get('/api/admin/cards');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.items)).toBe(true);
    expect(res.body.items.length).toBeGreaterThan(0);
    for (const item of res.body.items) {
      expect(item.status).toBe('draft');
      expect(item.genMeta).toBeDefined();
      expect('setId' in item).toBe(true);
      expect(typeof item.createdAt).toBe('string');
      expect(typeof item.imageUrl).toBe('string');
      expect(item.imageUrl.startsWith('http')).toBe(true);
    }
    // The 60 seeded cards are approved, must not appear.
    const slugs: string[] = res.body.items.map((i: { slug: string }) => i.slug);
    expect(slugs.every((s) => s.startsWith(SLUG_PREFIX))).toBe(true);
  });

  it('6. GET /api/admin/cards?status=approved -> total 60', async () => {
    const res = await request(app.getHttpServer()).get('/api/admin/cards?status=approved');
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(60);
  });

  let approvedCardId: string;

  it('7. PATCH review: approve with no stats auto-fills ATK/DEF within the rarity range', async () => {
    const ingestRes = await request(app.getHttpServer())
      .post('/api/admin/cards/ingest')
      .send({ cards: [makeCard('review-target', { suggestedRarity: 'common' })] });
    expect(ingestRes.body.inserted).toBe(1);

    const listRes = await request(app.getHttpServer()).get(
      `/api/admin/cards?status=draft&limit=100`,
    );
    const target = listRes.body.items.find((i: { slug: string }) =>
      i.slug.endsWith('review-target'),
    );
    expect(target).toBeDefined();
    approvedCardId = target.id;

    const patchRes = await request(app.getHttpServer())
      .patch(`/api/admin/cards/${approvedCardId}`)
      .send({ status: 'approved', name: 'Ember Drake', rarity: 'epic' });

    expect(patchRes.status).toBe(200);
    expect(patchRes.body.status).toBe('approved');
    expect(patchRes.body.name).toBe('Ember Drake');
    expect(patchRes.body.rarity).toBe('epic');
    // Regression check: `element` was never mentioned in this PATCH body, so
    // it must survive untouched from ingest (`makeCard` defaults it to
    // 'fire') — an absent key must never be silently cleared to null.
    expect(patchRes.body.element).toBe('fire');

    const [min, max] = RARITY_META.epic.statRange;
    expect(patchRes.body.attack).toBeGreaterThanOrEqual(min);
    expect(patchRes.body.attack).toBeLessThanOrEqual(max);
    expect(patchRes.body.defense).toBeGreaterThanOrEqual(min);
    expect(patchRes.body.defense).toBeLessThanOrEqual(max);

    const rows = await dataSource.query('SELECT * FROM cards WHERE id = $1', [approvedCardId]);
    expect(rows[0].status).toBe('approved');
    expect(rows[0].name).toBe('Ember Drake');
    expect(rows[0].rarity).toBe('epic');
    expect(Number(rows[0].attack)).toBeGreaterThanOrEqual(min);
    expect(Number(rows[0].attack)).toBeLessThanOrEqual(max);
    expect(Number(rows[0].defense)).toBeGreaterThanOrEqual(min);
    expect(Number(rows[0].defense)).toBeLessThanOrEqual(max);
  });

  it('10. approved-only leakage check: player catalog picks up the newly-approved card, total moves 60 -> 61, never shows drafts', async () => {
    const catalogRes = await request(app.getHttpServer()).get('/api/cards?limit=100');
    expect(catalogRes.status).toBe(200);
    expect(catalogRes.body.total).toBe(61);

    const found = catalogRes.body.items.some((i: { id: string }) => i.id === approvedCardId);
    expect(found).toBe(true);

    for (const item of catalogRes.body.items) {
      expect(item.status).toBeUndefined();
    }

    // And the admin draft queue must never include an already-approved card.
    const draftRes = await request(app.getHttpServer()).get(
      '/api/admin/cards?status=draft&limit=100',
    );
    const draftIds: string[] = draftRes.body.items.map((i: { id: string }) => i.id);
    expect(draftIds.includes(approvedCardId)).toBe(false);
  });

  it('8. explicit stats win: PATCH with attack/defense keeps exact values even outside the rarity range', async () => {
    const ingestRes = await request(app.getHttpServer())
      .post('/api/admin/cards/ingest')
      .send({ cards: [makeCard('explicit-stats', { suggestedRarity: 'mythic' })] });
    expect(ingestRes.body.inserted).toBe(1);

    const listRes = await request(app.getHttpServer()).get(
      `/api/admin/cards?status=draft&limit=100`,
    );
    const target = listRes.body.items.find((i: { slug: string }) =>
      i.slug.endsWith('explicit-stats'),
    );
    expect(target).toBeDefined();

    const patchRes = await request(app.getHttpServer())
      .patch(`/api/admin/cards/${target.id}`)
      .send({ status: 'approved', attack: 3, defense: 4 });

    expect(patchRes.status).toBe(200);
    expect(patchRes.body.attack).toBe(3);
    expect(patchRes.body.defense).toBe(4);

    const rows = await dataSource.query('SELECT * FROM cards WHERE id = $1', [target.id]);
    expect(Number(rows[0].attack)).toBe(3);
    expect(Number(rows[0].defense)).toBe(4);
  });

  it('9. PATCH unknown uuid -> 404 CARD_NOT_FOUND', async () => {
    const res = await request(app.getHttpServer())
      .patch('/api/admin/cards/00000000-0000-4000-8000-000000000000')
      .send({ status: 'approved' });
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('CARD_NOT_FOUND');
  });

  it('explicit null clears element/flavorText; an absent key leaves them untouched', async () => {
    const ingestRes = await request(app.getHttpServer())
      .post('/api/admin/cards/ingest')
      .send({ cards: [makeCard('null-clear', { element: 'water' })] });
    expect(ingestRes.body.inserted).toBe(1);

    const listRes = await request(app.getHttpServer()).get(
      '/api/admin/cards?status=draft&limit=100',
    );
    const target = listRes.body.items.find((i: { slug: string }) => i.slug.endsWith('null-clear'));
    expect(target).toBeDefined();
    expect(target.element).toBe('water');

    // First PATCH: touch only flavorText, leave element alone.
    const firstPatch = await request(app.getHttpServer())
      .patch(`/api/admin/cards/${target.id}`)
      .send({ flavorText: 'a watery tale' });
    expect(firstPatch.status).toBe(200);
    expect(firstPatch.body.element).toBe('water');
    expect(firstPatch.body.flavorText).toBe('a watery tale');

    // Second PATCH: explicit null clears element, absent flavorText stays.
    const secondPatch = await request(app.getHttpServer())
      .patch(`/api/admin/cards/${target.id}`)
      .send({ element: null });
    expect(secondPatch.status).toBe(200);
    expect(secondPatch.body.element).toBeNull();
    expect(secondPatch.body.flavorText).toBe('a watery tale');

    const rows = await dataSource.query('SELECT * FROM cards WHERE id = $1', [target.id]);
    expect(rows[0].element).toBeNull();
    expect(rows[0].flavor_text).toBe('a watery tale');
  });
});
