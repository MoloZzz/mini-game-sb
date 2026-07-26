import { describe, expect, it } from 'vitest';
import { RARITIES, RARITY_META } from '@card-game/shared-types';

import { autofillStatForRarity, checkStatRange } from '../statValidation';

// Iterates every rarity from shared-types rather than hardcoding numbers, so
// a future change to `RARITY_META[r].statRange` fails this suite instead of
// silently drifting from the review screen's validation.
describe('checkStatRange', () => {
  for (const rarity of RARITIES) {
    const [min, max] = RARITY_META[rarity].statRange;

    it(`flags a value below the ${rarity} range as out of range`, () => {
      const result = checkStatRange(rarity, min - 1, min - 1);
      expect(result.min).toBe(min);
      expect(result.max).toBe(max);
      expect(result.attackInRange).toBe(false);
      expect(result.defenseInRange).toBe(false);
    });

    it(`accepts both boundary values for ${rarity}`, () => {
      const result = checkStatRange(rarity, min, max);
      expect(result.attackInRange).toBe(true);
      expect(result.defenseInRange).toBe(true);
    });

    it(`flags a value above the ${rarity} range as out of range`, () => {
      const result = checkStatRange(rarity, max + 1, max + 1);
      expect(result.attackInRange).toBe(false);
      expect(result.defenseInRange).toBe(false);
    });

    it(`autofillStatForRarity(${rarity}) always lands inside its range`, () => {
      const value = autofillStatForRarity(rarity);
      expect(value).toBeGreaterThanOrEqual(min);
      expect(value).toBeLessThanOrEqual(max);
    });
  }
});
