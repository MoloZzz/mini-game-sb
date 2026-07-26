import {
  ARCHETYPES,
  ELEMENTS,
  RARITIES,
  RARITY_META,
  type Archetype,
  type CardDto,
  type Element,
  type Rarity,
} from '@card-game/shared-types';

/**
 * Six fantasy-flavoured names per rarity. Flavour scales with rarity, same as
 * the real card-forge pool eventually will: small vermin at common, cosmic
 * horrors at mythic.
 */
const NAMES_BY_RARITY: Readonly<Record<Rarity, readonly string[]>> = {
  common: ['Bog Rat', 'Ash Sprite', 'Field Mouse', 'Dusty Crow', 'Mud Imp', 'Wisp Moth'],
  uncommon: ['Thorn Wolf', 'Cinder Fox', 'Moss Golem', 'Brine Eel', 'Sand Viper', 'Frost Hare'],
  rare: ['Storm Falcon', 'Iron Boar', 'Night Panther', 'Coral Serpent', 'Granite Bear', 'Ember Stag'],
  epic: ['Void Wraith', 'Marsh Hydra', 'Sky Griffin', 'Bone Chimera', 'Tide Leviathan', 'Star Lynx'],
  legendary: [
    'Ember Drake',
    'Frost Phoenix',
    'Shadow Basilisk',
    'Solar Wyvern',
    'Abyssal Kraken',
    'Runed Colossus',
  ],
  mythic: [
    'Astral Dragon',
    'World Serpent',
    'Eternal Phoenix',
    'Chaos Titan',
    'Genesis Wyrm',
    'Oblivion Sphinx',
  ],
};

const FLAVOR_BY_RARITY: Readonly<Record<Rarity, readonly (string | null)[]>> = {
  common: [
    'Scurries wherever the crumbs are.',
    null,
    'Unremarkable, except to the mouse itself.',
    'Leaves the campsite untouched. Mostly.',
    'Born in mud, dies in mud.',
    null,
  ],
  uncommon: [
    'Hunts in packs of exactly one.',
    'Smells of woodsmoke and old copper.',
    null,
    'Prefers brackish water and worse company.',
    'Its bite is a rumour, not a threat.',
    'Leaves frost where its paws land.',
  ],
  rare: [
    'Rides the storm front, never behind it.',
    'Tusks scarred from a hundred small wars.',
    null,
    'Coils around warnings and ignores them.',
    'Mountains wear down faster than its patience.',
    'Antlers glow faintly after dusk.',
  ],
  epic: [
    'What it forgets stays forgotten.',
    'Three heads argue over one meal.',
    'Circles higher than the weather allows.',
    'Assembled from bones that were never its own.',
    'The tide answers to it, not the moon.',
    'Constellations rearrange when it blinks.',
  ],
  legendary: [
    'Its breath remembers the first fire.',
    'Winter ends wherever it lands.',
    "A glance turns rumor into stone.",
    'Eclipses follow it out of habit.',
    'The deep sea has a name for it, unspoken.',
    'Runes on its hide predate the language that reads them.',
  ],
  mythic: [
    'Older than the sky it flies through.',
    'Coiled once around everything that exists.',
    'Dies exactly as often as it needs to.',
    'Its footsteps are measured in eras.',
    'The first thing that was, and will be again.',
    'Asks riddles it already knows the answer to.',
  ],
};

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

/**
 * Spreads six cards' stats across the rarity's inclusive statRange without
 * hardcoding numbers that could drift from shared-types. Attack and defense
 * use different offsets through the range so a card isn't just ATK==DEF.
 */
function statFor(range: readonly [number, number], localIndex: number, offset: number): number {
  const [min, max] = range;
  const span = max - min + 1;
  return min + ((localIndex + offset) % span);
}

function buildCardsForRarity(rarity: Rarity): CardDto[] {
  const names = NAMES_BY_RARITY[rarity];
  const flavors = FLAVOR_BY_RARITY[rarity];
  const { statRange } = RARITY_META[rarity];

  return names.map((name, localIndex) => {
    const globalIndex = RARITIES.indexOf(rarity) * 6 + localIndex;
    const variant = (localIndex % 3) + 1;
    const element: Element | null =
      globalIndex === 3 || globalIndex === 20 ? null : ELEMENTS[globalIndex % ELEMENTS.length];
    const archetype: Archetype = ARCHETYPES[globalIndex % ARCHETYPES.length];

    return {
      id: `mock-${rarity}-${localIndex + 1}`,
      slug: slugify(name),
      name,
      rarity,
      element,
      archetype,
      attack: statFor(statRange, localIndex, 0),
      defense: statFor(statRange, localIndex, 2),
      flavorText: flavors[localIndex] ?? null,
      thumbUrl: `/mock/thumbs/${rarity}-${variant}.svg`,
      imageUrl: `/mock/art/${rarity}-${variant}.svg`,
    };
  });
}

export const cardsByRarity: Record<Rarity, CardDto[]> = Object.fromEntries(
  RARITIES.map((rarity) => [rarity, buildCardsForRarity(rarity)]),
) as Record<Rarity, CardDto[]>;

export const MOCK_CARDS: CardDto[] = RARITIES.flatMap((rarity) => cardsByRarity[rarity]);
