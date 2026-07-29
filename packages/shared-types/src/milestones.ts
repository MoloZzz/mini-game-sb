import type { Balance } from './player.js';

/**
 * Collection milestones — economy fix, part 1. `openCase` today pays out
 * almost nothing early game because `LAST_COPY` blocks selling a card owned
 * only once, and the resulting real EV (`Σ w_r × sellValue_r × owned_r /
 * pool_r`) is ~1.7 coins on a 100-coin case against a ~19/432 owned/pool
 * ratio. Milestones pay out on collection BREADTH instead — exactly what a
 * new player has plenty of — as a second, independent reward channel on top
 * of drops.
 */

export const MILESTONE_KEYS = [
  'unique_10',
  'unique_25',
  'unique_50',
  'unique_75',
  'unique_100',
  'unique_150',
  'unique_200',
  'unique_250',
  'unique_300',
  'unique_350',
  'unique_400',
  'unique_432',
] as const;
export type MilestoneKey = (typeof MILESTONE_KEYS)[number];

export interface MilestoneTier {
  key: MilestoneKey;
  /**
   * ABSOLUTE count of distinct unique cards owned required to reach this
   * tier — NEVER a percentage of the approved-card pool. A percentage would
   * retroactively un-earn every already-awarded milestone the moment the
   * pool grows (see `unique_432`'s own comment below for the sharpest case
   * of this).
   */
  uniqueCards: number;
  reward: Balance;
}

/**
 * The ladder. 15,100 coins + 36 keys over a full collection lifetime.
 *
 * Tier 12 (`unique_432`) is FROZEN at 432 — the size of the pool as of this
 * ladder's writing — ON PURPOSE. Growing the approved-card pool is a
 * deliberate content decision that should add a tier 13 at the new total,
 * not silently move this one's goalpost: a self-adjusting "full collection"
 * tier would un-complete itself (and take back its own reward's *narrative*,
 * even though the reward itself, once paid, is never clawed back) for a
 * player who already finished it, the instant one more card is approved.
 */
export const MILESTONE_LADDER: readonly MilestoneTier[] = [
  { key: 'unique_10', uniqueCards: 10, reward: { coins: 200, keys: 0 } },
  { key: 'unique_25', uniqueCards: 25, reward: { coins: 300, keys: 1 } },
  { key: 'unique_50', uniqueCards: 50, reward: { coins: 500, keys: 1 } },
  { key: 'unique_75', uniqueCards: 75, reward: { coins: 700, keys: 1 } },
  { key: 'unique_100', uniqueCards: 100, reward: { coins: 900, keys: 2 } },
  { key: 'unique_150', uniqueCards: 150, reward: { coins: 1200, keys: 2 } },
  { key: 'unique_200', uniqueCards: 200, reward: { coins: 1500, keys: 3 } },
  { key: 'unique_250', uniqueCards: 250, reward: { coins: 1800, keys: 3 } },
  { key: 'unique_300', uniqueCards: 300, reward: { coins: 2000, keys: 4 } },
  { key: 'unique_350', uniqueCards: 350, reward: { coins: 2000, keys: 4 } },
  { key: 'unique_400', uniqueCards: 400, reward: { coins: 2000, keys: 5 } },
  { key: 'unique_432', uniqueCards: 432, reward: { coins: 2000, keys: 10 } },
];

export function isMilestoneKey(value: unknown): value is MilestoneKey {
  return typeof value === 'string' && (MILESTONE_KEYS as readonly string[]).includes(value);
}

/** `GET /me/milestones` — read-only, one row per ladder tier. */
export interface MilestoneStatusDto extends MilestoneTier {
  earned: boolean;
  /** ISO timestamp, or null while unearned. */
  awardedAt: string | null;
}

export interface MilestonesResponseDto {
  /** The player's current DISTINCT unsold-card count — the same value every tier's `uniqueCards` is compared against. */
  ownedUniqueCards: number;
  tiers: MilestoneStatusDto[];
}
