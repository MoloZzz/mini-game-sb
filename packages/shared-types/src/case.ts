import type { CardDto } from './card.js';
import type { Rarity } from './rarity.js';

/** Percentage weights per rarity. Every row must sum to exactly 100. */
export type RarityWeights = Record<Rarity, number>;

export interface CaseDto {
  slug: string;
  name: string;
  priceCoins: number | null;
  priceKeys: number | null;
  imageUrl: string;
  /** Shown in the UI verbatim — displaying odds is a free trust element. */
  odds: RarityWeights;
  /** Six showcase cards for the lobby tile. */
  previewCards: CardDto[];
}

/**
 * Seed values for the three launch cases.
 * Source: card-game-data/05 - Game Design - Rarity & Drop Rates.md
 * The API seeds `cases.rarity_weights` from this; the UI uses it for the
 * "1 in N" odds column before any network call.
 */
export const CASE_WEIGHTS: Readonly<Record<string, RarityWeights>> = {
  'starter-chest': {
    common: 60.0,
    uncommon: 22.0,
    rare: 12.0,
    epic: 4.5,
    legendary: 1.3,
    mythic: 0.2,
  },
  'ember-vault': {
    common: 0.0,
    uncommon: 45.0,
    rare: 33.0,
    epic: 15.0,
    legendary: 6.0,
    mythic: 1.0,
  },
  'arcane-reliquary': {
    common: 0.0,
    uncommon: 20.0,
    rare: 38.0,
    epic: 27.0,
    legendary: 12.0,
    mythic: 3.0,
  },
};

export interface CaseSeed {
  slug: string;
  name: string;
  priceCoins: number | null;
  priceKeys: number | null;
  imagePath: string;
  weights: RarityWeights;
}

export const CASE_SEEDS: readonly CaseSeed[] = [
  {
    slug: 'starter-chest',
    name: 'Starter Chest',
    priceCoins: 100,
    priceKeys: null,
    imagePath: 'cases/starter-chest.png',
    weights: CASE_WEIGHTS['starter-chest']!,
  },
  {
    slug: 'ember-vault',
    name: 'Ember Vault',
    priceCoins: 350,
    priceKeys: null,
    imagePath: 'cases/ember-vault.png',
    weights: CASE_WEIGHTS['ember-vault']!,
  },
  {
    slug: 'arcane-reliquary',
    name: 'Arcane Reliquary',
    priceCoins: null,
    priceKeys: 1,
    imagePath: 'cases/arcane-reliquary.png',
    weights: CASE_WEIGHTS['arcane-reliquary']!,
  },
];

/** "1 in N" reads as odds; "0.2%" reads as an abstraction. Show both. */
export function oneInN(percent: number): number | null {
  if (percent <= 0) return null;
  return 100 / percent;
}

/** Guard used by the weight-sum test and by case seeding. */
export function weightsSumTo100(weights: RarityWeights, epsilon = 1e-9): boolean {
  const sum = Object.values(weights).reduce((a, b) => a + b, 0);
  return Math.abs(sum - 100) < epsilon;
}
