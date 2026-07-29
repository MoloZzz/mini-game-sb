import type { CardDto, Element } from './card.js';
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

  // --- Element cases ---
  //
  // These are themed, NOT filtered: an Ashen Forge can drop a water card. The
  // element drives art, name and colour only. Making them filter the pool would
  // mean element+rarity combinations that do not exist (there is no mythic air
  // card) and a 409 on the roll, which is why it is not done here.
  //
  // Each profile is deliberately distinct — six cases with the same curve and a
  // different picture would be six copies of one case.
  'ashen-forge': {
    // Aggressive middle: fewer commons, fat rare band.
    common: 35.0,
    uncommon: 33.0,
    rare: 20.0,
    epic: 8.5,
    legendary: 3.0,
    mythic: 0.5,
  },
  'tidal-vault': {
    // Steady all-rounder, a gentler starter-chest.
    common: 40.0,
    uncommon: 32.0,
    rare: 19.0,
    epic: 7.0,
    legendary: 1.8,
    mythic: 0.2,
  },
  'stoneheart-coffer': {
    // Cheap and safe: high volume, very low ceiling.
    common: 48.0,
    uncommon: 30.0,
    rare: 16.0,
    epic: 5.0,
    legendary: 0.9,
    mythic: 0.1,
  },
  'stormglass-case': {
    // Swingy: thin commons, the best legendary rate outside the key cases.
    common: 30.0,
    uncommon: 30.0,
    rare: 24.0,
    epic: 11.0,
    legendary: 4.2,
    mythic: 0.8,
  },
  'radiant-ark': {
    // Premium, no commons at all.
    common: 0.0,
    uncommon: 38.0,
    rare: 34.0,
    epic: 20.0,
    legendary: 6.8,
    mythic: 1.2,
  },
  'void-casket': {
    // The gamble: top-heavy, priciest coin case in the game.
    common: 0.0,
    uncommon: 27.0,
    rare: 35.0,
    epic: 25.0,
    legendary: 10.0,
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
  /**
   * Cosmetic only — drives the tile's accent colour and the art brief, never
   * which cards can drop. Deliberately kept off `CaseDto` and out of the
   * `cases` table: no column, no migration, and the UI resolves it from
   * CASE_SEEDS by slug, the same way it already reads CASE_WEIGHTS for the
   * odds table before any network call.
   */
  element: Element | null;
}

export const CASE_SEEDS: readonly CaseSeed[] = [
  {
    slug: 'starter-chest',
    name: 'Starter Chest',
    priceCoins: 100,
    priceKeys: null,
    imagePath: 'cases/starter-chest.png',
    weights: CASE_WEIGHTS['starter-chest']!,
    element: null,
  },
  {
    // Fire-flavoured by name, but deliberately not part of the element set —
    // `element` marks the six themed cases, and two fire tiles side by side
    // would just look like a duplicate of Ashen Forge.
    slug: 'ember-vault',
    name: 'Ember Vault',
    priceCoins: 350,
    priceKeys: null,
    imagePath: 'cases/ember-vault.png',
    weights: CASE_WEIGHTS['ember-vault']!,
    element: null,
  },
  {
    slug: 'arcane-reliquary',
    name: 'Arcane Reliquary',
    priceCoins: null,
    priceKeys: 1,
    imagePath: 'cases/arcane-reliquary.png',
    weights: CASE_WEIGHTS['arcane-reliquary']!,
    element: null,
  },
  {
    slug: 'ashen-forge',
    name: 'Ashen Forge',
    priceCoins: 250,
    priceKeys: null,
    imagePath: 'cases/ashen-forge.png',
    weights: CASE_WEIGHTS['ashen-forge']!,
    element: 'fire',
  },
  {
    slug: 'tidal-vault',
    name: 'Tidal Vault',
    priceCoins: 220,
    priceKeys: null,
    imagePath: 'cases/tidal-vault.png',
    weights: CASE_WEIGHTS['tidal-vault']!,
    element: 'water',
  },
  {
    // 180->120 (economy fix, part 1): at 180 this was strictly dominated by
    // the 100-coin Starter Chest (34% EV ratio vs. Starter Chest's 61%), so
    // no player had any reason to buy it. At 120 the ratio is 51% and its
    // narrower rare band buys measurably faster collection. This constant
    // alone never reaches a live database — `seedCases` skips slugs that
    // already exist — so the matching migration
    // `UpdateStoneheartCofferPrice` carries the real `UPDATE`.
    slug: 'stoneheart-coffer',
    name: 'Stoneheart Coffer',
    priceCoins: 120,
    priceKeys: null,
    imagePath: 'cases/stoneheart-coffer.png',
    weights: CASE_WEIGHTS['stoneheart-coffer']!,
    element: 'earth',
  },
  {
    slug: 'stormglass-case',
    name: 'Stormglass Case',
    priceCoins: 300,
    priceKeys: null,
    imagePath: 'cases/stormglass-case.png',
    weights: CASE_WEIGHTS['stormglass-case']!,
    element: 'air',
  },
  {
    slug: 'radiant-ark',
    name: 'Radiant Ark',
    priceCoins: 500,
    priceKeys: null,
    imagePath: 'cases/radiant-ark.png',
    weights: CASE_WEIGHTS['radiant-ark']!,
    element: 'light',
  },
  {
    slug: 'void-casket',
    name: 'Void Casket',
    priceCoins: 650,
    priceKeys: null,
    imagePath: 'cases/void-casket.png',
    weights: CASE_WEIGHTS['void-casket']!,
    element: 'shadow',
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
