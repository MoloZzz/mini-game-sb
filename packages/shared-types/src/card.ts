import type { Rarity } from './rarity.js';


export const ELEMENTS = ['fire', 'water', 'earth', 'air', 'shadow', 'light', 'luna'] as const;
export type Element = (typeof ELEMENTS)[number];

/**
 * Card subject categories. Not all of them are creatures: `sword`, `potion` and
 * `crystal` are objects, and they share this field rather than getting a
 * separate "kind" dimension because every consumer already treats `archetype`
 * as "what is depicted" — a prompt fragment in card-forge, a filter in the
 * inventory and admin screens. A second axis would buy nothing here.
 *
 * Appending to this list widens a Postgres enum (`card_archetype`); see the
 * game-api migration for why that cannot be a plain in-transaction ALTER TYPE.
 */
export const ARCHETYPES = [
  'beast',
  'humanoid',
  'undead',
  'construct',
  'spirit',
  'dragon',
  'slime',
  'sword',
  'potion',
  'crystal',
] as const;
export type Archetype = (typeof ARCHETYPES)[number];

/**
 * Which rarities each archetype is allowed to occupy.
 *
 * This is deliberately data rather than convention: dragons are the top of the
 * ladder and must never turn up as commons, while swords and potions are
 * everyday loot and would cheapen the mythic tier. card-forge builds its recipe
 * matrix from this, and the admin review screen uses it to flag a card whose
 * rarity was edited into a combination the collection is not supposed to hold.
 */
export const ARCHETYPE_RARITIES: Readonly<Record<Archetype, readonly Rarity[]>> = {
  beast: ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'],
  humanoid: ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'],
  undead: ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'],
  construct: ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'],
  spirit: ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'],
  dragon: ['legendary', 'mythic'],
  slime: ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'],
  sword: ['common', 'uncommon'],
  potion: ['common'],
  crystal: ['uncommon', 'rare'],
};

export const CARD_STATUSES = ['draft', 'approved', 'rejected'] as const;
export type CardStatus = (typeof CARD_STATUSES)[number];

/**
 * What the player sees. `imageUrl`/`thumbUrl` are already absolute — the API
 * prepends STATIC_BASE_URL, the UI never concatenates paths itself.
 */
export interface CardDto {
  id: string;
  slug: string;
  name: string;
  rarity: Rarity;
  element: Element | null;
  archetype: Archetype;
  attack: number;
  defense: number;
  flavorText: string | null;
  imageUrl: string;
  thumbUrl: string;
}

/**
 * Which generation order a card came out of. Present only on cards produced by
 * the admin order workflow, never on a plain `forge.py batch` ingest. Reviewing
 * such a card mirrors the verdict onto its candidate row, which is how an order
 * learns that one of its candidates has been decided.
 */
export interface GenerationOrderProvenance {
  orderId: string;
  candidateId: string;
  promptTemplateVersion: 'card-v1';
}

/** Everything about how a card was generated. Stored as jsonb, dev-only in the API. */
export interface GenMeta {
  model: string;
  prompt: string;
  negativePrompt: string;
  seed: number;
  steps: number;
  cfgScale: number;
  sampler: string;
  width: number;
  height: number;
  recipeId: string;
  generatedAt: string;
  generationOrder?: GenerationOrderProvenance;
  [key: string]: unknown;
}

/** Admin view — adds review fields the player never sees. */
export interface AdminCardDto extends CardDto {
  status: CardStatus;
  setId: string | null;
  genMeta: GenMeta;
  createdAt: string;
}
