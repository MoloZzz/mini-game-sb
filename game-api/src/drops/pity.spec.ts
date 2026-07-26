import {
  CASE_WEIGHTS,
  PITY_RESET_RARITY,
  PITY_THRESHOLD,
  RARITIES,
  isAtLeast,
} from '@card-game/shared-types';
import type { Rarity } from '@card-game/shared-types';
import { rollRarity } from './roll-rarity';
import { createSeededRng } from './rng';
import { nextPityCounter } from './pity';

describe('nextPityCounter', () => {
  it('increments by 1 on a common/uncommon/rare (dry) drop', () => {
    expect(nextPityCounter(0, 'common')).toBe(1);
    expect(nextPityCounter(5, 'uncommon')).toBe(6);
    expect(nextPityCounter(29, 'rare')).toBe(30);
  });

  it('resets to 0 on an epic/legendary/mythic (good) drop, from any starting value', () => {
    expect(nextPityCounter(0, 'epic')).toBe(0);
    expect(nextPityCounter(15, 'legendary')).toBe(0);
    expect(nextPityCounter(PITY_THRESHOLD, 'mythic')).toBe(0);
    expect(nextPityCounter(999, 'epic')).toBe(0);
  });

  it('matches isAtLeast(rarity, PITY_RESET_RARITY) as the reset condition, for every rarity', () => {
    for (const rarity of RARITIES) {
      const result = nextPityCounter(10, rarity);
      if (isAtLeast(rarity, PITY_RESET_RARITY)) {
        expect(result).toBe(0);
      } else {
        expect(result).toBe(11);
      }
    }
  });
});

/**
 * End-to-end simulation of what A6 actually does every opening: hold
 * `pityCounter`, call `rollRarity` with it, then feed the result into
 * `nextPityCounter` for the next iteration. This proves the two pieces
 * combine to force epic+ at exactly `pityCounter === PITY_THRESHOLD`
 * (per the existing convention in roll-rarity.spec.ts's "pity gate fires on
 * exactly the 30th dry opening" tests) — not one opening early, not one late.
 */
describe('nextPityCounter combined with rollRarity — dry-streak simulation', () => {
  const weights = CASE_WEIGHTS['starter-chest']!;
  const allRarities: readonly Rarity[] = RARITIES;

  /** Drives a guaranteed-dry streak of `count` openings by restricting the
   *  available pool to common/uncommon/rare only, so rollRarity can never
   *  produce an epic+ result to end the streak early. Returns the resulting
   *  pity counter. */
  function driveDryStreak(count: number, rng = createSeededRng(1)): number {
    let counter = 0;
    for (let i = 0; i < count; i++) {
      const result = rollRarity({
        weights,
        pityCounter: counter,
        availableRarities: ['common', 'uncommon', 'rare'],
        rng,
      });
      expect(result).not.toBeNull();
      expect(isAtLeast(result as Rarity, PITY_RESET_RARITY)).toBe(false);
      counter = nextPityCounter(counter, result as Rarity);
    }
    return counter;
  }

  it('29 consecutive dry openings leave the counter at 29 (PITY_THRESHOLD - 1)', () => {
    const counter = driveDryStreak(PITY_THRESHOLD - 1);
    expect(counter).toBe(PITY_THRESHOLD - 1);
  });

  it('at pityCounter = 29, rollRarity does NOT always force epic+ (gate not yet active)', () => {
    let sawNonEpicPlus = false;
    for (let seed = 0; seed < 50; seed++) {
      const rng = createSeededRng(seed * 1301 + 11);
      const result = rollRarity({
        weights,
        pityCounter: PITY_THRESHOLD - 1,
        availableRarities: allRarities,
        rng,
      });
      expect(result).not.toBeNull();
      if (!isAtLeast(result as Rarity, PITY_RESET_RARITY)) {
        sawNonEpicPlus = true;
      }
    }
    expect(sawNonEpicPlus).toBe(true);
  });

  it('30 consecutive dry openings bring the counter to exactly 30 (PITY_THRESHOLD)', () => {
    const counter = driveDryStreak(PITY_THRESHOLD);
    expect(counter).toBe(PITY_THRESHOLD);
  });

  it('at pityCounter = 30 (the 30th dry opening), rollRarity ALWAYS forces epic+', () => {
    for (let seed = 0; seed < 50; seed++) {
      const rng = createSeededRng(seed * 7919 + 3);
      const result = rollRarity({
        weights,
        pityCounter: PITY_THRESHOLD,
        availableRarities: allRarities,
        rng,
      });
      expect(result).not.toBeNull();
      expect(isAtLeast(result as Rarity, PITY_RESET_RARITY)).toBe(true);
    }
  });

  it('at pityCounter = 31, rollRarity still forces epic+ (the gate does not close again)', () => {
    for (let seed = 0; seed < 20; seed++) {
      const rng = createSeededRng(seed * 5003 + 5);
      const result = rollRarity({
        weights,
        pityCounter: PITY_THRESHOLD + 1,
        availableRarities: allRarities,
        rng,
      });
      expect(result).not.toBeNull();
      expect(isAtLeast(result as Rarity, PITY_RESET_RARITY)).toBe(true);
    }
  });

  it('an epic+ drop mid-streak resets the counter to 0, restarting the dry count', () => {
    // Simulate: 10 dry openings, then one epic drop (forced via nextPityCounter
    // directly, since we only need to prove the counter arithmetic here).
    let counter = 0;
    for (let i = 0; i < 10; i++) counter = nextPityCounter(counter, 'common');
    expect(counter).toBe(10);
    counter = nextPityCounter(counter, 'epic');
    expect(counter).toBe(0);
  });
});
