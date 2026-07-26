import { randomInt } from 'crypto';

/**
 * Minimal RNG abstraction so the drop engine never depends on a concrete
 * source of randomness. Production code must always be injected with the
 * crypto-backed implementation below; tests may inject the seeded one.
 */
export interface Rng {
  /** Uniform float in [0, 1). */
  nextFloat(): number;
  /** Uniform integer in [0, maxExclusive). */
  nextInt(maxExclusive: number): number;
  /** Uniform element from a non-empty array. */
  pick<T>(items: readonly T[]): T;
}

/** Resolution for `nextFloat()` draws: 2^48 distinct buckets. */
const FLOAT_RESOLUTION = 2 ** 48;
/** crypto.randomInt requires (max - min) <= 2^48 - 1, so the draw itself is capped one below the resolution. */
const MAX_RANDOM_INT_EXCLUSIVE = FLOAT_RESOLUTION - 1;

/**
 * Production RNG. Backed by Node's `crypto.randomInt` -- deliberately not
 * the standard library's non-cryptographic pseudo-random source. The vault
 * (`05 - Game Design - Rarity & Drop Rates.md`) is explicit about this: not
 * because anyone could cheat a local single-player game, but because it is
 * a one-line difference and it is simply correct.
 */
export function createCryptoRng(): Rng {
  return {
    nextFloat(): number {
      // High-resolution integer draw so 0.1 percentage-point weights (e.g.
      // mythic at 0.2%) resolve exactly.
      return randomInt(0, MAX_RANDOM_INT_EXCLUSIVE) / FLOAT_RESOLUTION;
    },
    nextInt(maxExclusive: number): number {
      if (!Number.isFinite(maxExclusive) || maxExclusive <= 0) {
        throw new Error(`nextInt: maxExclusive must be > 0, got ${maxExclusive}`);
      }
      return randomInt(0, maxExclusive);
    },
    pick<T>(items: readonly T[]): T {
      if (items.length === 0) {
        throw new Error('pick: items must be a non-empty array');
      }
      return items[randomInt(0, items.length)] as T;
    },
  };
}

/**
 * Deterministic pseudo-random generator (mulberry32) for TESTS ONLY.
 * Production code paths must never construct this -- it exists purely so
 * specs can seed reproducible sequences (e.g. pinning the 200k-roll
 * probability assertions to a fixed seed). Do not import this from anything
 * outside `*.spec.ts` / `*.slow.spec.ts`.
 */
export function createSeededRng(seed: number): Rng {
  let state = seed >>> 0;

  function mulberry32(): number {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  return {
    nextFloat(): number {
      return mulberry32();
    },
    nextInt(maxExclusive: number): number {
      if (!Number.isFinite(maxExclusive) || maxExclusive <= 0) {
        throw new Error(`nextInt: maxExclusive must be > 0, got ${maxExclusive}`);
      }
      return Math.floor(mulberry32() * maxExclusive);
    },
    pick<T>(items: readonly T[]): T {
      if (items.length === 0) {
        throw new Error('pick: items must be a non-empty array');
      }
      return items[Math.floor(mulberry32() * items.length)] as T;
    },
  };
}
