/**
 * Rarity table — the single source of truth for both services.
 * Source: card-game-data/05 - Game Design - Rarity & Drop Rates.md
 *
 * Colours deliberately follow the MMO/CS:GO convention (ADR-011): the player
 * reads rarity from the colour before reading the word.
 */

export const RARITIES = [
  'common',
  'uncommon',
  'rare',
  'epic',
  'legendary',
  'mythic',
] as const;

export type Rarity = (typeof RARITIES)[number];

/** Ascending rarity index — useful for sorting and for pity comparisons. */
export const RARITY_ORDER: Readonly<Record<Rarity, number>> = {
  common: 0,
  uncommon: 1,
  rare: 2,
  epic: 3,
  legendary: 4,
  mythic: 5,
};

/** Anything at or above this counts as a "good" drop and resets the pity counter. */
export const PITY_RESET_RARITY: Rarity = 'epic';

/** Dry openings before the next roll is forced to epic+. */
export const PITY_THRESHOLD = 30;

export interface RarityMeta {
  /** Hex colour for frames, glows and reel tiles. */
  readonly color: string;
  /** Coins gained when selling one duplicate instance. */
  readonly sellValue: number;
  /** Target number of approved cards of this rarity in the finished pool. */
  readonly poolTarget: number;
  /** Inclusive ATK/DEF range used to auto-fill stats at review time (Q4). */
  readonly statRange: readonly [min: number, max: number];
}

export const RARITY_META: Readonly<Record<Rarity, RarityMeta>> = {
  common: { color: '#9CA3AF', sellValue: 15, poolTarget: 40, statRange: [1, 4] },
  uncommon: { color: '#22C55E', sellValue: 40, poolTarget: 30, statRange: [3, 7] },
  rare: { color: '#3B82F6', sellValue: 100, poolTarget: 20, statRange: [6, 10] },
  epic: { color: '#A855F7', sellValue: 300, poolTarget: 12, statRange: [9, 14] },
  legendary: { color: '#F59E0B', sellValue: 900, poolTarget: 6, statRange: [13, 18] },
  mythic: { color: '#EC4899', sellValue: 3000, poolTarget: 2, statRange: [17, 22] },
};

/** 110 — the full collection target. */
export const POOL_TARGET_TOTAL = RARITIES.reduce(
  (sum, r) => sum + RARITY_META[r].poolTarget,
  0,
);

export function isRarity(value: unknown): value is Rarity {
  return typeof value === 'string' && (RARITIES as readonly string[]).includes(value);
}

/** True when `rarity` is at least as rare as `floor`. */
export function isAtLeast(rarity: Rarity, floor: Rarity): boolean {
  return RARITY_ORDER[rarity] >= RARITY_ORDER[floor];
}
