import type { Element } from './card.js';
import type { Rarity } from './rarity.js';

/**
 * A thematic set is content metadata, not a reward system. Cards keep the
 * database `set_id` so the drop service can scope a case without trusting a
 * client-supplied filter.
 */
export interface ThematicSetSeed {
  id: string;
  slug: string;
  name: string;
  description: string;
  cardCount: number;
  caseSlug: string;
}

/** Stable UUID used by the Ashen Wastes card records and Cinderbound Cache. */
export const ASHEN_WASTES_SET_ID = '8a3b8787-6d09-4c98-a85b-5e964df85ed8';

export const THEMATIC_SET_SEEDS: readonly ThematicSetSeed[] = [
  {
    id: ASHEN_WASTES_SET_ID,
    slug: 'ashen-wastes',
    name: 'Ashen Wastes',
    description: 'Ember beasts, old relics and wind spirits fight for the last heat of an extinguished forge.',
    cardCount: 20,
    caseSlug: 'cinderbound-cache',
  },
];

/** Content plan for the first set. The seed command turns these into approved local cards. */
export interface ThematicCardSeed {
  slug: string;
  name: string;
  rarity: Rarity;
  element: Element;
  archetype: 'beast' | 'humanoid' | 'undead' | 'construct' | 'spirit' | 'dragon' | 'slime' | 'sword' | 'potion' | 'crystal';
}

export const ASHEN_WASTES_CARDS: readonly ThematicCardSeed[] = [
  { slug: 'ashen-wastes-cinder-rat', name: 'Cinder Rat', rarity: 'common', element: 'fire', archetype: 'beast' },
  { slug: 'ashen-wastes-ember-sifter', name: 'Ember Sifter', rarity: 'common', element: 'fire', archetype: 'humanoid' },
  { slug: 'ashen-wastes-slag-slime', name: 'Slag Slime', rarity: 'common', element: 'earth', archetype: 'slime' },
  { slug: 'ashen-wastes-ashwing-moth', name: 'Ashwing Moth', rarity: 'common', element: 'air', archetype: 'spirit' },
  { slug: 'ashen-wastes-broken-tongs', name: 'Broken Tongs', rarity: 'common', element: 'earth', archetype: 'sword' },
  { slug: 'ashen-wastes-coal-spark', name: 'Coal Spark', rarity: 'common', element: 'fire', archetype: 'spirit' },
  { slug: 'ashen-wastes-grit-walker', name: 'Grit Walker', rarity: 'common', element: 'earth', archetype: 'undead' },
  { slug: 'ashen-wastes-scorched-vial', name: 'Scorched Vial', rarity: 'common', element: 'fire', archetype: 'potion' },
  { slug: 'ashen-wastes-sable-marshal', name: 'Sable Marshal', rarity: 'uncommon', element: 'shadow', archetype: 'humanoid' },
  { slug: 'ashen-wastes-vent-spirit', name: 'Vent Spirit', rarity: 'uncommon', element: 'air', archetype: 'spirit' },
  { slug: 'ashen-wastes-cinder-crystal', name: 'Cinder Crystal', rarity: 'uncommon', element: 'fire', archetype: 'crystal' },
  { slug: 'ashen-wastes-iron-vulture', name: 'Iron Vulture', rarity: 'uncommon', element: 'earth', archetype: 'beast' },
  { slug: 'ashen-wastes-ashbound-scout', name: 'Ashbound Scout', rarity: 'uncommon', element: 'fire', archetype: 'humanoid' },
  { slug: 'ashen-wastes-forge-wraith', name: 'Forge Wraith', rarity: 'rare', element: 'shadow', archetype: 'undead' },
  { slug: 'ashen-wastes-glassback-ram', name: 'Glassback Ram', rarity: 'rare', element: 'earth', archetype: 'beast' },
  { slug: 'ashen-wastes-embersworn-blade', name: 'Embersworn Blade', rarity: 'rare', element: 'fire', archetype: 'sword' },
  { slug: 'ashen-wastes-brazier-warden', name: 'Brazier Warden', rarity: 'epic', element: 'fire', archetype: 'construct' },
  { slug: 'ashen-wastes-gale-of-embers', name: 'Gale of Embers', rarity: 'epic', element: 'air', archetype: 'spirit' },
  { slug: 'ashen-wastes-last-forgemaster', name: 'Last Forgemaster', rarity: 'legendary', element: 'fire', archetype: 'humanoid' },
  { slug: 'ashen-wastes-heart-of-the-forge', name: 'Heart of the Forge', rarity: 'mythic', element: 'fire', archetype: 'dragon' },
];
