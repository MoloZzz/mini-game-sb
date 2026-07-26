import {
  RARITIES,
  RARITY_ORDER,
  REEL_LENGTH,
  WINNING_INDEX,
  FILLER_DISTRIBUTION,
  MIN_HIGH_RARITY_FILLERS,
  HIGH_RARITY_BAND,
  FORBIDDEN_HIGH_RARITY_INDICES,
  type Rarity,
  type ReelTileDto,
} from '@card-game/shared-types';
import type { Rng } from './rng';

/** Minimal card shape needed to place a tile on the reel. */
export interface ReelCard {
  id: string;
  name: string;
  rarity: Rarity;
  thumbUrl: string;
}

/** Approved cards available as filler, grouped by rarity. */
export type FillerPool = Readonly<Partial<Record<Rarity, readonly ReelCard[]>>>;

export interface BuildReelParams {
  winner: ReelCard;
  pool: FillerPool;
  rng: Rng;
}

function isHighRarity(rarity: Rarity): boolean {
  return rarity === 'legendary' || rarity === 'mythic';
}

function isInBand(index: number): boolean {
  return index >= HIGH_RARITY_BAND[0] && index <= HIGH_RARITY_BAND[1];
}

function isForbiddenIndex(index: number): boolean {
  return FORBIDDEN_HIGH_RARITY_INDICES.includes(index);
}

/** Legendary/mythic may only sit inside the band, and never at a forbidden index. */
function isLegalAt(rarity: Rarity, index: number): boolean {
  if (!isHighRarity(rarity)) return true;
  return isInBand(index) && !isForbiddenIndex(index);
}

function toTile(card: ReelCard): ReelTileDto {
  return { id: card.id, name: card.name, rarity: card.rarity, thumbUrl: card.thumbUrl };
}

/** Samples a rarity from the cosmetic FILLER_DISTRIBUTION (never the case's drop weights). */
function sampleFillerRarity(rng: Rng): Rarity {
  const r = rng.nextFloat() * 100;
  let cumulative = 0;
  for (const rarity of RARITIES) {
    cumulative += FILLER_DISTRIBUTION[rarity];
    if (cumulative > r) return rarity;
  }
  return RARITIES[RARITIES.length - 1];
}

/**
 * Rarities to try, nearest-first: the sampled rarity itself, then
 * alternating one step down, one step up, until both directions are
 * exhausted. Used to widen the search when the sampled rarity's pool is
 * empty, or every candidate card is excluded by adjacency rules.
 */
function candidateRarityOrder(start: Rarity): Rarity[] {
  const startIdx = RARITY_ORDER[start];
  const order: Rarity[] = [start];
  let down = startIdx - 1;
  let up = startIdx + 1;
  while (down >= 0 || up < RARITIES.length) {
    if (down >= 0) {
      order.push(RARITIES[down]!);
      down--;
    }
    if (up < RARITIES.length) {
      order.push(RARITIES[up]!);
      up++;
    }
  }
  return order;
}

function pickFillerTile(
  index: number,
  tiles: readonly ReelTileDto[],
  winner: ReelCard,
  pool: FillerPool,
  rng: Rng,
): ReelTileDto {
  const excludeIds = new Set<string>();
  const previous = tiles[index - 1];
  if (index > 0 && previous) excludeIds.add(previous.id);
  // The winner (index 55) is a neighbour of both 54 and 56; exclude it
  // explicitly at both, since the left-to-right "previous tile" rule alone
  // only covers 56 (whose predecessor *is* the winner).
  if (index === 54 || index === 56) excludeIds.add(winner.id);

  let sampled = sampleFillerRarity(rng);
  // Outside the band, high-rarity fillers are capped at epic.
  if (isHighRarity(sampled) && !isInBand(index)) {
    sampled = 'epic';
  }

  for (const rarity of candidateRarityOrder(sampled)) {
    if (!isLegalAt(rarity, index)) continue;
    const options = (pool[rarity] ?? []).filter((c) => !excludeIds.has(c.id));
    if (options.length === 0) continue;
    return toTile(rng.pick(options));
  }

  // Unreachable in practice: buildReel already guarantees >= 2 distinct
  // cards in the pool, and the loop above covers every rarity. Thrown
  // instead of looping forever, to keep termination bounded and obvious.
  throw new Error(`buildReel: no eligible filler card found for index ${index}`);
}

function shuffled<T>(items: readonly T[], rng: Rng): T[] {
  const arr = items.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = rng.nextInt(i + 1);
    const tmp = arr[i]!;
    arr[i] = arr[j]!;
    arr[j] = tmp;
  }
  return arr;
}

/**
 * Ensures at least MIN_HIGH_RARITY_FILLERS legendary+ fillers exist inside
 * HIGH_RARITY_BAND, upgrading randomly chosen in-band positions in place.
 * Returns true if the minimum could not be fully met (pool has too few, or
 * no, legendary/mythic cards) -- an intentionally silent relaxation rather
 * than a thrown error, per the documented spec: "if the pool contains no
 * legendary or mythic cards at all, this is unsatisfiable... satisfy as
 * many as the pool allows and do not throw."
 */
function forceHighRarityMinimum(tiles: ReelTileDto[], pool: FillerPool, rng: Rng): boolean {
  const bandIndices: number[] = [];
  for (let i = HIGH_RARITY_BAND[0]; i <= HIGH_RARITY_BAND[1]; i++) bandIndices.push(i);

  const countHigh = () => bandIndices.filter((i) => isHighRarity(tiles[i]!.rarity)).length;

  let needed = MIN_HIGH_RARITY_FILLERS - countHigh();
  if (needed <= 0) return false;

  const candidates = shuffled(
    bandIndices.filter((i) => !isHighRarity(tiles[i]!.rarity)),
    rng,
  );

  for (const i of candidates) {
    if (needed <= 0) break;

    const neighborIds = new Set<string>();
    const left = tiles[i - 1];
    const right = tiles[i + 1];
    if (i - 1 >= 0 && left) neighborIds.add(left.id);
    if (i + 1 < tiles.length && right) neighborIds.add(right.id);

    const legendaryOptions = (pool.legendary ?? []).filter((c) => !neighborIds.has(c.id));
    const mythicOptions = (pool.mythic ?? []).filter((c) => !neighborIds.has(c.id));
    const options = legendaryOptions.length > 0 ? legendaryOptions : mythicOptions;
    if (options.length === 0) continue; // try the next shuffled position instead

    tiles[i] = toTile(rng.pick(options));
    needed--;
  }

  return needed > 0;
}

/**
 * Builds the REEL_LENGTH-tile spin reel around a fixed winner (vault 05 +
 * 08). Fillers are sampled from the cosmetic FILLER_DISTRIBUTION, never
 * from the case's real drop weights -- see reel.ts for why.
 */
export function buildReel(params: BuildReelParams): ReelTileDto[] {
  const { winner, pool, rng } = params;

  // Fillers are drawn only from `pool` (never from the winner card itself,
  // which is only ever consulted to exclude it from the winner's immediate
  // neighbours). So the pool itself -- not pool+winner -- needs at least 2
  // distinct ids, or every filler position would collide with its neighbour.
  const poolIds = new Set<string>();
  for (const rarity of RARITIES) {
    for (const card of pool[rarity] ?? []) poolIds.add(card.id);
  }
  if (poolIds.size < 2) {
    throw new Error('buildReel needs at least 2 distinct cards in the pool');
  }

  const tiles: ReelTileDto[] = new Array(REEL_LENGTH);
  tiles[WINNING_INDEX] = toTile(winner);

  for (let i = 0; i < REEL_LENGTH; i++) {
    if (i === WINNING_INDEX) continue;
    tiles[i] = pickFillerTile(i, tiles, winner, pool, rng);
  }

  // Near-miss guarantee: keep gold in the reel regardless of the winner's
  // own rarity. Do NOT skip this based on winner.rarity.
  forceHighRarityMinimum(tiles, pool, rng);

  return tiles;
}
