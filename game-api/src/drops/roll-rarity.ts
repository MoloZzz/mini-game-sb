import {
  RARITIES,
  PITY_RESET_RARITY,
  PITY_THRESHOLD,
  isAtLeast,
  type Rarity,
  type RarityWeights,
} from '@card-game/shared-types';
import type { Rng } from './rng';

export interface RollRarityParams {
  /** From the case's jsonb. */
  weights: RarityWeights;
  /** players.pity_counter */
  pityCounter: number;
  /** Rarities that actually have >= 1 approved card. */
  availableRarities: Iterable<Rarity>;
  rng: Rng;
}

/**
 * Builds a full RarityWeights record (all six keys) from a partial map of
 * raw (non-negative, possibly zero) weights, renormalized so the surviving
 * entries sum to exactly 100. Rarities absent from `weights`, or with a
 * weight <= 0, are treated as 0 and excluded from the sum.
 */
export function normalizeWeights(weights: Partial<Record<Rarity, number>>): RarityWeights {
  const sum = RARITIES.reduce((acc, r) => {
    const w = weights[r] ?? 0;
    return acc + (w > 0 ? w : 0);
  }, 0);

  const result = {} as Record<Rarity, number>;
  for (const r of RARITIES) {
    const w = weights[r] ?? 0;
    result[r] = sum > 0 && w > 0 ? (w / sum) * 100 : 0;
  }
  return result as RarityWeights;
}

/** Raw (non-renormalized) weights, keeping only rarities that pass `keep`. */
function filterRaw(
  weights: RarityWeights,
  keep: (r: Rarity) => boolean,
): Partial<Record<Rarity, number>> {
  const restricted: Partial<Record<Rarity, number>> = {};
  for (const r of RARITIES) {
    if (keep(r) && weights[r] > 0) {
      restricted[r] = weights[r];
    }
  }
  return restricted;
}

function hasSurvivor(weights: RarityWeights): boolean {
  return RARITIES.some((r) => weights[r] > 0);
}

/**
 * Vault algorithm (card-game-data/05 - Game Design - Rarity & Drop Rates.md),
 * implemented in exactly this order:
 *   1. Start from the case's raw weights.
 *   2. Pity gate: if pityCounter >= PITY_THRESHOLD, discard
 *      common/uncommon/rare, keeping only rarities >= PITY_RESET_RARITY.
 *   3. Availability gate: drop every rarity with no approved card, and every
 *      rarity whose weight is <= 0. This happens BEFORE the roll -- rolling
 *      a rarity with zero available cards must be structurally impossible,
 *      not a case handled after the fact.
 *   4. Renormalize the survivors to sum to 100.
 *   5. Roll: r = rng.nextFloat() * 100, walk the cumulative sum in RARITIES
 *      order, return the first rarity whose cumulative weight exceeds r.
 *
 * Note: renormalizing once between steps 2 and 3 vs. renormalizing only once
 * at the very end are mathematically equivalent (renormalization is a
 * uniform rescale, so an intermediate renormalize does not change the
 * relative proportions that survive into the final renormalize). This
 * implementation renormalizes once, after both filters have been applied,
 * for simplicity.
 *
 * Returns null only when nothing at all can be rolled -- the caller maps
 * that to 409 EMPTY_POOL.
 */
export function rollRarity(params: RollRarityParams): Rarity | null {
  const { weights, pityCounter, availableRarities, rng } = params;
  const available = new Set(availableRarities);
  const pityActive = pityCounter >= PITY_THRESHOLD;

  // Step 2: pity gate (no-op when pity is not active).
  const pityGated = pityActive
    ? filterRaw(weights, (r) => isAtLeast(r, PITY_RESET_RARITY))
    : { ...weights };

  // Step 3 + 4: availability gate, then renormalize.
  const afterAvailability = filterRaw(normalizeWeights(pityGated), (r) => available.has(r));
  let finalWeights = normalizeWeights(afterAvailability);

  if (!hasSurvivor(finalWeights)) {
    if (!pityActive) {
      return null;
    }

    // Documented edge case: pity is active but the player's world has no
    // approved epic+ card at all (pity-gated set becomes empty once the
    // availability gate is applied). Returning null here would 409 a player
    // who has plenty of commons available -- worse than silently failing to
    // honour an unsatisfiable pity promise. Fall back to the
    // availability-filtered set computed WITHOUT the pity gate. The pity
    // counter itself is left untouched; that bookkeeping belongs to the
    // caller (stage A6).
    const fallback = filterRaw(weights, (r) => available.has(r));
    finalWeights = normalizeWeights(fallback);

    if (!hasSurvivor(finalWeights)) {
      return null;
    }
  }

  // Step 5: roll.
  const r = rng.nextFloat() * 100;
  let cumulative = 0;
  for (const rarity of RARITIES) {
    cumulative += finalWeights[rarity];
    if (cumulative > r) {
      return rarity;
    }
  }

  // Floating-point edge guard: the cumulative sum should reach 100, but if
  // rounding leaves `r` just past the last boundary, fall through to the
  // last surviving rarity instead of returning null.
  for (let i = RARITIES.length - 1; i >= 0; i--) {
    const rarity = RARITIES[i]!;
    if (finalWeights[rarity] > 0) {
      return rarity;
    }
  }

  return null;
}
