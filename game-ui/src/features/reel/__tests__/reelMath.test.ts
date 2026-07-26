import { describe, expect, it } from 'vitest';
import { PITCH, REEL_LENGTH, TILE_GAP, TILE_W, WINNING_INDEX, JITTER_FRACTION } from '@card-game/shared-types';

import {
  markerStripX,
  randomJitter,
  STRIP_WIDTH,
  targetOffset,
  tileCenter,
  tileIndexUnderMarker,
} from '../reelMath';

const MAX_JITTER = TILE_W * JITTER_FRACTION;

describe('STRIP_WIDTH', () => {
  it('equals REEL_LENGTH * PITCH - TILE_GAP', () => {
    expect(STRIP_WIDTH).toBe(REEL_LENGTH * PITCH - TILE_GAP);
  });
});

describe('tileCenter', () => {
  it('matches the spec formula for the winning tile', () => {
    expect(tileCenter(WINNING_INDEX)).toBe(WINNING_INDEX * PITCH + TILE_W / 2);
  });
});

describe('the sweep: marker always lands on the winner, never a neighbour', () => {
  const containerWidths: number[] = [];
  for (let w = 320; w <= 2560; w += 7) containerWidths.push(w);

  const jitters: number[] = [];
  const STEPS = 40; // 41 evenly-spaced values from -MAX_JITTER to +MAX_JITTER
  for (let i = 0; i <= STEPS; i++) {
    jitters.push(-MAX_JITTER + (2 * MAX_JITTER * i) / STEPS);
  }

  it('tileIndexUnderMarker(containerW, targetOffset(containerW, jitter)) === WINNING_INDEX for every combination', () => {
    for (const containerW of containerWidths) {
      for (const jitter of jitters) {
        const target = targetOffset(containerW, jitter);
        const idx = tileIndexUnderMarker(containerW, target);
        expect(idx).toBe(WINNING_INDEX);
      }
    }
  });

  it('markerStripX stays within half a tile width of the winner tile centre', () => {
    for (const containerW of containerWidths) {
      for (const jitter of jitters) {
        const target = targetOffset(containerW, jitter);
        const stripX = markerStripX(containerW, target);
        expect(Math.abs(stripX - tileCenter(WINNING_INDEX))).toBeLessThan(TILE_W / 2);
      }
    }
  });
});

describe('randomJitter', () => {
  it('stays within ±(TILE_W * JITTER_FRACTION), covers most of that range, and centres near zero over many draws', () => {
    const N = 20_000;
    let min = Infinity;
    let max = -Infinity;
    let sum = 0;

    for (let i = 0; i < N; i++) {
      const j = randomJitter();
      expect(j).toBeGreaterThanOrEqual(-MAX_JITTER);
      expect(j).toBeLessThanOrEqual(MAX_JITTER);
      min = Math.min(min, j);
      max = Math.max(max, j);
      sum += j;
    }

    const observedSpread = max - min;
    // Real randomness, not a stub pinned to zero: the spread should cover
    // most of the ±MAX_JITTER range.
    expect(observedSpread).toBeGreaterThan(2 * MAX_JITTER * 0.8);

    const mean = sum / N;
    expect(Math.abs(mean)).toBeLessThan(MAX_JITTER * 0.1);
  });

  it('is deterministic when given a seeded rng', () => {
    const rng = () => 0.75;
    // (0.75 - 0.5) * 2 * TILE_W * JITTER_FRACTION
    expect(randomJitter(rng)).toBeCloseTo((0.75 - 0.5) * 2 * MAX_JITTER, 10);
  });
});

describe('targetOffset', () => {
  it('is negative for realistic container widths', () => {
    for (const containerW of [320, 768, 1024, 1440, 1920, 2560]) {
      expect(targetOffset(containerW, 0)).toBeLessThan(0);
    }
  });
});
