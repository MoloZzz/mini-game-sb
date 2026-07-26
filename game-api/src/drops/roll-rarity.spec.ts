import { readFileSync } from 'fs';
import { join } from 'path';
import {
  CASE_WEIGHTS,
  weightsSumTo100,
  RARITIES,
  PITY_THRESHOLD,
  PITY_RESET_RARITY,
  isAtLeast,
  type Rarity,
} from '@card-game/shared-types';
import { rollRarity } from './roll-rarity';
import { createCryptoRng, createSeededRng } from './rng';

// Some of these are high-volume probabilistic tests (tens of thousands of
// rolls); give them more headroom than jest's 5s default.
jest.setTimeout(30_000);

describe('rollRarity', () => {
  const starterWeights = CASE_WEIGHTS['starter-chest']!;
  const allRarities: readonly Rarity[] = RARITIES;

  describe('weight sums', () => {
    it('every CASE_WEIGHTS row sums to exactly 100, per weightsSumTo100', () => {
      for (const slug of Object.keys(CASE_WEIGHTS)) {
        expect(weightsSumTo100(CASE_WEIGHTS[slug]!)).toBe(true);
      }
    });

    it('every CASE_WEIGHTS row sums to 100 via a direct sum, for all nine slugs', () => {
      const slugs = [
        'starter-chest',
        'ember-vault',
        'arcane-reliquary',
        'ashen-forge',
        'tidal-vault',
        'stoneheart-coffer',
        'stormglass-case',
        'radiant-ark',
        'void-casket',
      ];
      expect(Object.keys(CASE_WEIGHTS).sort()).toEqual(slugs.sort());
      for (const slug of slugs) {
        const weights = CASE_WEIGHTS[slug]!;
        const sum = RARITIES.reduce((acc, r) => acc + weights[r], 0);
        expect(sum).toBeCloseTo(100, 9);
      }
    });
  });

  describe('pity gate fires on exactly the 30th dry opening', () => {
    it('does NOT force epic+ before the threshold (pityCounter = PITY_THRESHOLD - 1)', () => {
      let sawNonEpicPlus = false;
      for (let seed = 0; seed < 40; seed++) {
        const rng = createSeededRng(seed * 7919 + 1);
        for (let i = 0; i < 50; i++) {
          const result = rollRarity({
            weights: starterWeights,
            pityCounter: PITY_THRESHOLD - 1,
            availableRarities: allRarities,
            rng,
          });
          if (result !== null && !isAtLeast(result, PITY_RESET_RARITY)) {
            sawNonEpicPlus = true;
          }
        }
      }
      // "may be anything" -- this proves the gate is not prematurely applied.
      expect(sawNonEpicPlus).toBe(true);
    });

    it('ALWAYS forces epic+ at pityCounter === PITY_THRESHOLD (>= 2000 iterations, many seeds)', () => {
      let iterations = 0;
      for (let seed = 0; seed < 40; seed++) {
        const rng = createSeededRng(seed * 104729 + 3);
        for (let i = 0; i < 50; i++) {
          const result = rollRarity({
            weights: starterWeights,
            pityCounter: PITY_THRESHOLD,
            availableRarities: allRarities,
            rng,
          });
          iterations++;
          expect(result).not.toBeNull();
          expect(isAtLeast(result as Rarity, PITY_RESET_RARITY)).toBe(true);
        }
      }
      expect(iterations).toBeGreaterThanOrEqual(2000);
    });
  });

  describe('pity counter resets on epic+ (helper written here; the real one lives in A6)', () => {
    function nextPityCounter(counter: number, rarity: Rarity): number {
      return isAtLeast(rarity, PITY_RESET_RARITY) ? 0 : counter + 1;
    }

    it('is 0 immediately after any epic-or-better drop, and previous + 1 otherwise', () => {
      const sequence: Rarity[] = [
        'common',
        'common',
        'uncommon',
        'epic',
        'rare',
        'legendary',
        'common',
        'mythic',
        'uncommon',
      ];
      let counter = 0;
      const observed: number[] = [];
      for (const rarity of sequence) {
        counter = nextPityCounter(counter, rarity);
        observed.push(counter);
      }
      expect(observed).toEqual([1, 2, 3, 0, 1, 0, 1, 0, 1]);
    });
  });

  describe('empty pool is never rolled', () => {
    it('20000 rolls with availableRarities = [common, uncommon] never return rare+', () => {
      const rng = createCryptoRng();
      const available: Rarity[] = ['common', 'uncommon'];
      const seen = new Set<Rarity>();
      for (let i = 0; i < 20_000; i++) {
        const result = rollRarity({
          weights: starterWeights,
          pityCounter: 0,
          availableRarities: available,
          rng,
        });
        expect(result).not.toBeNull();
        seen.add(result as Rarity);
      }
      for (const r of seen) {
        expect(available).toContain(r);
      }
    });
  });

  describe('empty pool is renormalized, not merely rejected', () => {
    it('with availableRarities = [common, mythic], mythic share ~= 0.2/60.2 over 100000 rolls', () => {
      const rng = createCryptoRng();
      const available: Rarity[] = ['common', 'mythic'];
      const N = 100_000;
      let mythicCount = 0;
      for (let i = 0; i < N; i++) {
        const result = rollRarity({
          weights: starterWeights,
          pityCounter: 0,
          availableRarities: available,
          rng,
        });
        expect(result).not.toBeNull();
        expect(available).toContain(result as Rarity);
        if (result === 'mythic') mythicCount++;
      }
      const observed = mythicCount / N;
      const expected = 0.2 / 60.2;
      expect(Math.abs(observed - expected)).toBeLessThan(0.001);
    });
  });

  describe('nothing available', () => {
    it('returns null', () => {
      const rng = createSeededRng(42);
      const result = rollRarity({
        weights: starterWeights,
        pityCounter: 0,
        availableRarities: [],
        rng,
      });
      expect(result).toBeNull();
    });
  });

  describe('pity active + unsatisfiable epic+ pool', () => {
    it('falls back to the available set rather than returning null', () => {
      const rng = createCryptoRng();
      const available: Rarity[] = ['common', 'uncommon'];
      for (let i = 0; i < 500; i++) {
        const result = rollRarity({
          weights: starterWeights,
          pityCounter: PITY_THRESHOLD,
          availableRarities: available,
          rng,
        });
        expect(result).not.toBeNull();
        expect(available).toContain(result as Rarity);
      }
    });
  });

  describe('RNG hygiene', () => {
    it('Math.random never appears in src/drops source', () => {
      const files = ['rng.ts', 'roll-rarity.ts', 'build-reel.ts'];
      for (const file of files) {
        const src = readFileSync(join(__dirname, file), 'utf8');
        expect(src).not.toContain('Math.random');
      }
    });
  });
});
