import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { weightsSumTo100 } from '@card-game/shared-types';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import type { AppConfig } from '../src/config/configuration';

describe('Read endpoints (e2e)', () => {
  let app: NestExpressApplication;

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

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/health -> 200', async () => {
    const res = await request(app.getHttpServer()).get('/api/health');
    expect(res.status).toBe(200);
  });

  it('GET /api/cards -> 200 with total 60, default limit 40, absolute image URLs, no status field', async () => {
    const res = await request(app.getHttpServer()).get('/api/cards');
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(60);
    expect(res.body.items.length).toBe(40);
    for (const item of res.body.items) {
      expect(item.imageUrl.startsWith('http://localhost:3000/static/')).toBe(true);
      // No double slash after the scheme.
      const afterScheme = item.imageUrl.replace('http://', '');
      expect(afterScheme.includes('//')).toBe(false);
      expect(item.status).toBeUndefined();
    }
  });

  it('GET /api/cards?rarity=mythic -> total 2', async () => {
    const res = await request(app.getHttpServer()).get('/api/cards?rarity=mythic');
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(2);
  });

  it('GET /api/cards?limit=5&page=2 -> 5 items, page 2', async () => {
    const res = await request(app.getHttpServer()).get('/api/cards?limit=5&page=2');
    expect(res.status).toBe(200);
    expect(res.body.items.length).toBe(5);
    expect(res.body.page).toBe(2);
  });

  it('GET /api/cards/:id -> 200 with genMeta present (EXPOSE_GEN_META defaults true)', async () => {
    const list = await request(app.getHttpServer()).get('/api/cards?limit=1');
    const id = list.body.items[0].id;

    const res = await request(app.getHttpServer()).get(`/api/cards/${id}`);
    expect(res.status).toBe(200);
    expect(res.body.genMeta).toBeDefined();
  });

  it('GET /api/cards/<random uuid> -> 404 CARD_NOT_FOUND', async () => {
    const res = await request(app.getHttpServer()).get(
      '/api/cards/00000000-0000-4000-8000-000000000000',
    );
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('CARD_NOT_FOUND');
  });

  it('GET /api/cases -> 200, 3 cases, odds sum to 100, 6 preview cards each', async () => {
    const res = await request(app.getHttpServer()).get('/api/cases');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBe(3);
    for (const caseDto of res.body) {
      expect(weightsSumTo100(caseDto.odds)).toBe(true);
      expect(caseDto.previewCards.length).toBe(6);
    }
  });

  it('GET /api/me -> 200 with seeded balance and stats', async () => {
    const res = await request(app.getHttpServer()).get('/api/me');
    expect(res.status).toBe(200);
    expect(res.body.balance.coins).toBe(1000);
    expect(res.body.balance.keys).toBe(5);
    expect(res.body.stats.casesOpened).toBe(0);
    expect(res.body.dailyBonusAvailableAt).toBeNull();
  });

  it('a real imageUrl from GET /api/cards actually resolves to a PNG', async () => {
    const list = await request(app.getHttpServer()).get('/api/cards?limit=1');
    const imageUrl: string = list.body.items[0].imageUrl;
    const path = imageUrl.replace('http://localhost:3000', '');

    const res = await request(app.getHttpServer()).get(path);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('image/png');
  });
});
