import type { Rarity } from './rarity.js';

export const ELEMENTS = ['fire', 'water', 'earth', 'air', 'shadow', 'light'] as const;
export type Element = (typeof ELEMENTS)[number];

export const ARCHETYPES = ['beast', 'humanoid', 'undead', 'construct', 'spirit'] as const;
export type Archetype = (typeof ARCHETYPES)[number];

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
  [key: string]: unknown;
}

/** Admin view — adds review fields the player never sees. */
export interface AdminCardDto extends CardDto {
  status: CardStatus;
  setId: string | null;
  genMeta: GenMeta;
  createdAt: string;
}
