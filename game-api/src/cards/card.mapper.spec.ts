import { ConfigService } from '@nestjs/config';
import { CardMapper } from './card.mapper';
import type { AppConfig } from '../config/configuration';
import type { CardEntity } from '../entities';

function makeConfigStub(staticBaseUrl: string): ConfigService<AppConfig, true> {
  return {
    get: (key: string) => {
      if (key === 'staticBaseUrl') return staticBaseUrl;
      throw new Error(`unexpected config key in test: ${key}`);
    },
  } as unknown as ConfigService<AppConfig, true>;
}

function makeCard(overrides: Partial<CardEntity> = {}): CardEntity {
  return {
    id: 'card-1',
    slug: 'ember-drake',
    name: 'Ember Drake',
    flavorText: 'Its breath remembers the first fire.',
    rarity: 'legendary',
    element: 'fire',
    archetype: 'beast',
    attack: 12,
    defense: 7,
    imagePath: 'cards/ember-drake-a3f1.png',
    thumbPath: 'thumbs/ember-drake-a3f1.webp',
    status: 'approved',
    setId: null,
    genMeta: { model: 'sd1.5', prompt: 'x', negativePrompt: '', seed: 1, steps: 20, cfgScale: 7, sampler: 'euler', width: 512, height: 512, recipeId: 'r1', generatedAt: '2026-01-01T00:00:00.000Z' },
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  } as CardEntity;
}

describe('CardMapper', () => {
  describe('toUrl', () => {
    it('joins a base without trailing slash and a path without leading slash with exactly one slash', () => {
      const mapper = new CardMapper(makeConfigStub('http://localhost:3000/static'));
      expect(mapper.toUrl('cards/foo.png')).toBe('http://localhost:3000/static/cards/foo.png');
    });

    it('joins a base WITH a trailing slash without producing a double slash', () => {
      const mapper = new CardMapper(makeConfigStub('http://localhost:3000/static/'));
      expect(mapper.toUrl('cards/foo.png')).toBe('http://localhost:3000/static/cards/foo.png');
    });

    it('joins a path WITH a leading slash without producing a double slash', () => {
      const mapper = new CardMapper(makeConfigStub('http://localhost:3000/static'));
      expect(mapper.toUrl('/cards/foo.png')).toBe('http://localhost:3000/static/cards/foo.png');
    });

    it('handles a trailing-slash base AND a leading-slash path together', () => {
      const mapper = new CardMapper(makeConfigStub('http://localhost:3000/static/'));
      expect(mapper.toUrl('/cards/foo.png')).toBe('http://localhost:3000/static/cards/foo.png');
    });
  });

  describe('toCardDto', () => {
    it('maps entity fields to the frozen CardDto shape', () => {
      const mapper = new CardMapper(makeConfigStub('http://localhost:3000/static'));
      const dto = mapper.toCardDto(makeCard());
      expect(dto).toEqual({
        id: 'card-1',
        slug: 'ember-drake',
        name: 'Ember Drake',
        rarity: 'legendary',
        element: 'fire',
        archetype: 'beast',
        attack: 12,
        defense: 7,
        flavorText: 'Its breath remembers the first fire.',
        imageUrl: 'http://localhost:3000/static/cards/ember-drake-a3f1.png',
        thumbUrl: 'http://localhost:3000/static/thumbs/ember-drake-a3f1.webp',
      });
    });
  });

  describe('toCardDetail', () => {
    it('includes genMeta when exposeGenMeta is true', () => {
      const mapper = new CardMapper(makeConfigStub('http://localhost:3000/static'));
      const dto = mapper.toCardDetail(makeCard(), true);
      expect(dto.genMeta).toBeDefined();
      expect(dto.genMeta?.model).toBe('sd1.5');
    });

    it('omits the genMeta KEY entirely (not just undefined) when exposeGenMeta is false', () => {
      const mapper = new CardMapper(makeConfigStub('http://localhost:3000/static'));
      const dto = mapper.toCardDetail(makeCard(), false);
      expect('genMeta' in dto).toBe(false);
    });
  });

  describe('toAdminCardDto', () => {
    it('adds status, setId, genMeta and an ISO createdAt', () => {
      const mapper = new CardMapper(makeConfigStub('http://localhost:3000/static'));
      const dto = mapper.toAdminCardDto(makeCard());
      expect(dto.status).toBe('approved');
      expect(dto.setId).toBeNull();
      expect(dto.genMeta.model).toBe('sd1.5');
      expect(dto.createdAt).toBe('2026-01-01T00:00:00.000Z');
    });
  });

  describe('toReelTile', () => {
    it('returns only id, name, rarity and thumbUrl', () => {
      const mapper = new CardMapper(makeConfigStub('http://localhost:3000/static'));
      const tile = mapper.toReelTile(makeCard());
      expect(tile).toEqual({
        id: 'card-1',
        name: 'Ember Drake',
        rarity: 'legendary',
        thumbUrl: 'http://localhost:3000/static/thumbs/ember-drake-a3f1.webp',
      });
    });
  });
});
