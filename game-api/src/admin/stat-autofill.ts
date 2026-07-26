import { randomInt } from 'crypto';
import { RARITY_META } from '@card-game/shared-types';
import type { Rarity } from '@card-game/shared-types';

/**
 * `IngestCardInput` carries no `name` (vault Q3) — the human sets the real
 * one at review time. Ingest derives a placeholder from the slug so the
 * review queue isn't full of blank titles: hyphens become spaces, each word
 * is title-cased. `ember-drake-a3f1` -> `Ember Drake A3f1`.
 */
export function slugToName(slug: string): string {
  return slug
    .split('-')
    .map((word) => (word.length > 0 ? word[0].toUpperCase() + word.slice(1) : word))
    .join(' ');
}

/** Uniform integer in `[min, max]` inclusive, crypto-backed (never `Math.random()`). */
export function rollStatInRange(min: number, max: number): number {
  return randomInt(min, max + 1);
}

/** Q4 auto-fill: draws ATK and DEF independently from the rarity's stat range. */
export function autofillStats(rarity: Rarity): { attack: number; defense: number } {
  const [min, max] = RARITY_META[rarity].statRange;
  return {
    attack: rollStatInRange(min, max),
    defense: rollStatInRange(min, max),
  };
}
