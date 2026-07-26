import { JITTER_FRACTION, PITCH, REEL_LENGTH, TILE_GAP, TILE_W, WINNING_INDEX } from '@card-game/shared-types';

/**
 * Total pixel width of the strip: 60 tiles at PITCH, minus the trailing gap
 * (the last tile has no gap after it).
 */
export const STRIP_WIDTH = REEL_LENGTH * PITCH - TILE_GAP;

/** Centre of tile `index` in strip coordinates (strip's own left edge = 0). */
export function tileCenter(index: number): number {
  return index * PITCH + TILE_W / 2;
}

/**
 * Landing jitter in px, range exactly ±(JITTER_FRACTION × TILE_W) = ±42px.
 *
 * Mandatory, not decoration: a perfectly centred stop reads as fake within
 * three openings. The bound that would point the marker at a neighbour is
 * 0.5 × TILE_W = 70px; JITTER_FRACTION = 0.3 keeps the swing at 42px —
 * visibly off-centre, never wrong.
 */
export function randomJitter(rng: () => number = Math.random): number {
  return (rng() - 0.5) * 2 * TILE_W * JITTER_FRACTION;
}

/**
 * The translateX the strip must end at. Negative — the strip moves left so
 * the winner's centre (offset by `jitter`) lands under the marker fixed at
 * the container's horizontal centre.
 */
export function targetOffset(containerW: number, jitter: number): number {
  const winCenter = tileCenter(WINNING_INDEX);
  const base = winCenter - containerW / 2;
  return -(base + jitter);
}

/** Marker position expressed in strip coordinates, given a translateX. */
export function markerStripX(containerW: number, x: number): number {
  return containerW / 2 - x;
}

/** Which tile index the marker is over, for a given translateX. */
export function tileIndexUnderMarker(containerW: number, x: number): number {
  const stripX = markerStripX(containerW, x);
  return Math.floor(stripX / PITCH);
}
