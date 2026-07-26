import { PITY_RESET_RARITY, isAtLeast } from '@card-game/shared-types';
import type { Rarity } from '@card-game/shared-types';

/**
 * `players.pity_counter` update rule (vault 05 / A6): +1 on every dry
 * (below-`PITY_RESET_RARITY`) drop, reset to 0 the instant an epic-or-better
 * card is rolled — regardless of whether that drop was itself pity-forced.
 */
export function nextPityCounter(current: number, rolled: Rarity): number {
  return isAtLeast(rolled, PITY_RESET_RARITY) ? 0 : current + 1;
}
