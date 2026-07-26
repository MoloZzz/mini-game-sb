import {
  FILLER_DISTRIBUTION,
  FORBIDDEN_HIGH_RARITY_INDICES,
  HIGH_RARITY_BAND,
  MIN_HIGH_RARITY_FILLERS,
  RARITIES,
  REEL_LENGTH,
  WINNING_INDEX,
  isAtLeast,
  type CardDto,
  type Rarity,
  type RarityWeights,
  type ReelTileDto,
} from '@card-game/shared-types';

import { cardsByRarity } from './cards';

/**
 * Same slice-of-100 rarities are excluded (weight forced to 0) for filler
 * slots outside HIGH_RARITY_BAND, so a legendary/mythic can never be rolled
 * there in the first place — cheaper than rolling-then-rejecting.
 */
const BAND_EDGE_FILLER_DISTRIBUTION: RarityWeights = {
  ...FILLER_DISTRIBUTION,
  legendary: 0,
  mythic: 0,
};

export function rollRarity(weights: RarityWeights, rng: () => number = Math.random): Rarity {
  const total = RARITIES.reduce((sum, rarity) => sum + weights[rarity], 0);
  const roll = rng() * total;
  let cumulative = 0;
  for (const rarity of RARITIES) {
    cumulative += weights[rarity];
    if (roll < cumulative) return rarity;
  }
  // Floating-point edge case (roll === total exactly): fall back to the
  // rarest configured rarity rather than throwing.
  return RARITIES[RARITIES.length - 1];
}

function toTile(card: CardDto): ReelTileDto {
  return { id: card.id, name: card.name, rarity: card.rarity, thumbUrl: card.thumbUrl };
}

/** Uniform pick from the rarity's fixture pool, skipping ids in `avoid`. */
function pickCard(rarity: Rarity, avoid: ReadonlySet<string>, rng: () => number): CardDto {
  const pool = cardsByRarity[rarity];
  const start = Math.floor(rng() * pool.length);
  for (let offset = 0; offset < pool.length; offset++) {
    const candidate = pool[(start + offset) % pool.length];
    if (!avoid.has(candidate.id)) return candidate;
  }
  // Unreachable in practice: every rarity pool has 6 cards, `avoid` never
  // holds more than 2 ids (the two neighbours of a single slot).
  return pool[start];
}

function shuffle<T>(items: T[], rng: () => number): void {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = items[i];
    items[i] = items[j];
    items[j] = tmp;
  }
}

/**
 * Tops up the guaranteed near-miss beat if the natural roll came up short.
 * Only touches slots already confined to HIGH_RARITY_BAND and outside
 * FORBIDDEN_HIGH_RARITY_INDICES, so it can't violate either rule.
 */
function ensureMinHighRarityFillers(
  tiles: ReelTileDto[],
  highRarityIndices: readonly number[],
  rng: () => number,
): void {
  const shortfall = MIN_HIGH_RARITY_FILLERS - highRarityIndices.length;
  if (shortfall <= 0) return;

  const [bandStart, bandEnd] = HIGH_RARITY_BAND;
  const forbidden = new Set(FORBIDDEN_HIGH_RARITY_INDICES);
  const already = new Set(highRarityIndices);

  const candidates: number[] = [];
  for (let i = bandStart; i <= bandEnd; i++) {
    if (i === WINNING_INDEX || forbidden.has(i) || already.has(i)) continue;
    candidates.push(i);
  }
  shuffle(candidates, rng);

  let remaining = shortfall;
  for (const index of candidates) {
    if (remaining <= 0) break;
    const avoid = new Set<string>();
    if (index > 0) avoid.add(tiles[index - 1].id);
    if (index + 1 < tiles.length) avoid.add(tiles[index + 1].id);

    tiles[index] = toTile(pickCard('legendary', avoid, rng));
    remaining--;
  }
}

/**
 * Builds the 60-tile roulette strip per the "Побудова стрічки" recipe in
 * 05 - Game Design - Rarity & Drop Rates.md. Filler rarities come from
 * FILLER_DISTRIBUTION, never from the case's real drop weights — real
 * weights would put ~36 grey tiles in a row and the reel would look cheap.
 */
export function buildReel(wonCard: CardDto, rng: () => number = Math.random): ReelTileDto[] {
  const tiles: ReelTileDto[] = new Array(REEL_LENGTH);
  tiles[WINNING_INDEX] = toTile(wonCard);

  const [bandStart, bandEnd] = HIGH_RARITY_BAND;
  const forbidden = new Set(FORBIDDEN_HIGH_RARITY_INDICES);
  const highRarityIndices: number[] = [];

  for (let i = 0; i < REEL_LENGTH; i++) {
    if (i === WINNING_INDEX) continue;

    const inHighRarityZone = i >= bandStart && i <= bandEnd && !forbidden.has(i);
    const distribution = inHighRarityZone ? FILLER_DISTRIBUTION : BAND_EDGE_FILLER_DISTRIBUTION;
    const rarity = rollRarity(distribution, rng);
    if (isAtLeast(rarity, 'legendary')) highRarityIndices.push(i);

    const avoid = new Set<string>();
    if (i > 0) avoid.add(tiles[i - 1].id);
    // The right neighbour is only known ahead of time when it's the winner.
    if (i + 1 === WINNING_INDEX) avoid.add(wonCard.id);

    tiles[i] = toTile(pickCard(rarity, avoid, rng));
  }

  ensureMinHighRarityFillers(tiles, highRarityIndices, rng);

  return tiles;
}
