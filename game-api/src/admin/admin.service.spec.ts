import 'reflect-metadata';
import { RARITIES, RARITY_META } from '@card-game/shared-types';
import { validate } from 'class-validator';
import { IngestCardInputDto } from './dto/ingest.dto';
import { autofillStats, slugToName } from './stat-autofill';

describe('slugToName', () => {
  it('title-cases a multi-word hyphenated slug, preserving embedded digits', () => {
    expect(slugToName('ember-drake-a3f1')).toBe('Ember Drake A3f1');
  });

  it('handles a single-word slug', () => {
    expect(slugToName('dragon')).toBe('Dragon');
  });
});

describe('autofillStats (Q4 stat auto-fill)', () => {
  it('200 draws per rarity all land inside RARITY_META[rarity].statRange inclusive, and both endpoints are reachable', () => {
    for (const rarity of RARITIES) {
      const [min, max] = RARITY_META[rarity].statRange;
      let sawMin = false;
      let sawMax = false;

      for (let i = 0; i < 200; i++) {
        const { attack, defense } = autofillStats(rarity);
        for (const stat of [attack, defense]) {
          expect(Number.isInteger(stat)).toBe(true);
          expect(stat).toBeGreaterThanOrEqual(min);
          expect(stat).toBeLessThanOrEqual(max);
          if (stat === min) sawMin = true;
          if (stat === max) sawMax = true;
        }
      }

      expect(sawMin).toBe(true);
      expect(sawMax).toBe(true);
    }
  });
});

describe('IngestCardInputDto relative-path validation', () => {
  function makeCard(overrides: Partial<IngestCardInputDto> = {}): IngestCardInputDto {
    const dto = new IngestCardInputDto();
    dto.slug = 'ember-drake-a3f1';
    dto.imagePath = 'cards/ember-drake-a3f1.png';
    dto.thumbPath = 'thumbs/ember-drake-a3f1.webp';
    dto.suggestedRarity = 'epic';
    dto.archetype = 'beast';
    dto.element = 'fire';
    dto.genMeta = { foo: 'bar' } as unknown as IngestCardInputDto['genMeta'];
    Object.assign(dto, overrides);
    return dto;
  }

  it('rejects an absolute http:// imagePath', async () => {
    const errors = await validate(makeCard({ imagePath: 'http://evil/x.png' }));
    expect(errors.some((e) => e.property === 'imagePath')).toBe(true);
  });

  it('rejects an absolute https:// path (thumbPath)', async () => {
    const errors = await validate(makeCard({ thumbPath: 'https://evil/x.png' }));
    expect(errors.some((e) => e.property === 'thumbPath')).toBe(true);
  });

  it('rejects a leading-slash path', async () => {
    const errors = await validate(makeCard({ imagePath: '/abs/y.png' }));
    expect(errors.some((e) => e.property === 'imagePath')).toBe(true);
  });

  it('accepts a well-formed relative path', async () => {
    const errors = await validate(makeCard());
    expect(errors.length).toBe(0);
  });
});
