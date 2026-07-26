import type { Rarity } from './rarity.js';

/**
 * Reel geometry and timing.
 * Source: card-game-data/08 - UI - Roulette Spec.md
 *
 * The API builds a reel of REEL_LENGTH tiles with the winner at WINNING_INDEX;
 * the UI translates to that known position. Both sides read these constants,
 * so the contract cannot drift.
 */

export const TILE_W = 140;
export const TILE_GAP = 12;
export const PITCH = TILE_W + TILE_GAP; // 152

export const REEL_LENGTH = 60;
/** Far enough to build speed and decelerate; 4 tiles of runway remain to the right. */
export const WINNING_INDEX = 55;

export const SPIN_DURATION_MS = 5500;
/** Silence after the stop. Without it the reveal swallows the "it landed" beat. */
export const POST_STOP_PAUSE_MS = 300;

/** Long-tailed curve: sharp start, ~4s of decay, an almost imperceptible crawl. */
export const SPIN_EASING: readonly [number, number, number, number] = [0.12, 0.85, 0.2, 1.0];

/** Landing jitter as a fraction of tile width. Must stay below 0.5 or the marker points at a neighbour. */
export const JITTER_FRACTION = 0.3;

/**
 * Filler rarity mix — deliberately NOT the drop weights. Real weights would put
 * 36 grey tiles in a row and the reel would look cheap.
 */
export const FILLER_DISTRIBUTION: Readonly<Record<Rarity, number>> = {
  common: 35,
  uncommon: 28,
  rare: 22,
  epic: 11,
  legendary: 3.5,
  mythic: 0.5,
};

/** At least this many legendary+ tiles must appear, for the near-miss beat. */
export const MIN_HIGH_RARITY_FILLERS = 2;

/** High-rarity fillers are confined to this index band so they read while scrolling. */
export const HIGH_RARITY_BAND: readonly [start: number, end: number] = [10, 50];

/**
 * Never place legendary/mythic here — a flashy neighbour steals attention from
 * the winner at the moment of the stop.
 */
export const FORBIDDEN_HIGH_RARITY_INDICES: readonly number[] = [53, 54, 56, 57];

/** One reel tile. Thumbs only — 60 full PNGs would be ~60MB per opening. */
export interface ReelTileDto {
  id: string;
  name: string;
  rarity: Rarity;
  thumbUrl: string;
}
