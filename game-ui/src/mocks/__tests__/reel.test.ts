import { describe, expect, it } from 'vitest';
import {
  CASE_WEIGHTS,
  FORBIDDEN_HIGH_RARITY_INDICES,
  HIGH_RARITY_BAND,
  MIN_HIGH_RARITY_FILLERS,
  RARITIES,
  REEL_LENGTH,
  WINNING_INDEX,
  isAtLeast,
} from '@card-game/shared-types';

import { cardsByRarity } from '../fixtures/cards';
import { buildReel, rollRarity } from '../fixtures/reel';

/** Small, fast, seeded PRNG — deterministic failures, no external dep. */
function mulberry32(seed: number): () => number {
  let state = seed;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ITERATIONS = 200;
const [bandStart, bandEnd] = HIGH_RARITY_BAND;
const forbiddenIndices = new Set(FORBIDDEN_HIGH_RARITY_INDICES);

describe('buildReel', () => {
  it('always returns exactly REEL_LENGTH tiles', () => {
    for (let seed = 0; seed < ITERATIONS; seed++) {
      const wonCard = cardsByRarity.rare[seed % cardsByRarity.rare.length];
      const reel = buildReel(wonCard, mulberry32(seed));
      expect(reel).toHaveLength(REEL_LENGTH);
    }
  });

  it('places the winner at WINNING_INDEX for every rarity', () => {
    for (let seed = 0; seed < ITERATIONS; seed++) {
      for (const rarity of RARITIES) {
        const wonCard = cardsByRarity[rarity][seed % cardsByRarity[rarity].length];
        const reel = buildReel(wonCard, mulberry32(seed * 7 + 1));
        expect(reel[WINNING_INDEX].id).toBe(wonCard.id);
      }
    }
  });

  it('guarantees MIN_HIGH_RARITY_FILLERS legendary+ fillers, all inside HIGH_RARITY_BAND', () => {
    for (let seed = 0; seed < ITERATIONS; seed++) {
      for (const rarity of RARITIES) {
        const wonCard = cardsByRarity[rarity][seed % cardsByRarity[rarity].length];
        const reel = buildReel(wonCard, mulberry32(seed * 13 + 3));

        let highRarityFillerCount = 0;
        reel.forEach((tile, index) => {
          if (index === WINNING_INDEX) return;
          if (!isAtLeast(tile.rarity, 'legendary')) return;
          highRarityFillerCount++;
          expect(index).toBeGreaterThanOrEqual(bandStart);
          expect(index).toBeLessThanOrEqual(bandEnd);
        });

        expect(highRarityFillerCount).toBeGreaterThanOrEqual(MIN_HIGH_RARITY_FILLERS);
      }
    }
  });

  it('never places a legendary/mythic tile at a FORBIDDEN_HIGH_RARITY_INDICES index', () => {
    for (let seed = 0; seed < ITERATIONS; seed++) {
      for (const rarity of RARITIES) {
        const wonCard = cardsByRarity[rarity][seed % cardsByRarity[rarity].length];
        const reel = buildReel(wonCard, mulberry32(seed * 17 + 5));

        for (const index of forbiddenIndices) {
          if (index === WINNING_INDEX) continue;
          expect(isAtLeast(reel[index].rarity, 'legendary')).toBe(false);
        }
      }
    }
  });

  it('never places the same card id in two adjacent tiles', () => {
    for (let seed = 0; seed < ITERATIONS; seed++) {
      for (const rarity of RARITIES) {
        const wonCard = cardsByRarity[rarity][seed % cardsByRarity[rarity].length];
        const reel = buildReel(wonCard, mulberry32(seed * 23 + 9));

        for (let i = 0; i < reel.length - 1; i++) {
          expect(reel[i].id).not.toBe(reel[i + 1].id);
        }
      }
    }
  });

  it('every tile has a non-empty thumbUrl pointing under /mock/thumbs/', () => {
    for (let seed = 0; seed < ITERATIONS; seed++) {
      const wonCard = cardsByRarity.mythic[seed % cardsByRarity.mythic.length];
      const reel = buildReel(wonCard, mulberry32(seed * 29 + 11));

      for (const tile of reel) {
        expect(tile.thumbUrl.length).toBeGreaterThan(0);
        expect(tile.thumbUrl.startsWith('/mock/thumbs/')).toBe(true);
      }
    }
  });

  it('is deterministic given a deterministic rng', () => {
    for (let seed = 0; seed < ITERATIONS; seed++) {
      const wonCard = cardsByRarity.epic[seed % cardsByRarity.epic.length];
      const reelA = buildReel(wonCard, mulberry32(seed));
      const reelB = buildReel(wonCard, mulberry32(seed));
      expect(reelB).toEqual(reelA);
    }
  });
});

describe('rollRarity', () => {
  it('matches the configured Starter Chest weights within tolerance', () => {
    const N = 100_000;
    const weights = CASE_WEIGHTS['starter-chest'];
    const rng = mulberry32(42);

    let commonCount = 0;
    for (let i = 0; i < N; i++) {
      if (rollRarity(weights, rng) === 'common') commonCount++;
    }

    expect(Math.abs(commonCount / N - 0.6)).toBeLessThanOrEqual(0.01);
  });
});
