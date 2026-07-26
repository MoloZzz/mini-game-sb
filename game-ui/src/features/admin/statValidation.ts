import { ARCHETYPE_RARITIES, RARITY_META, type Archetype, type Rarity } from '@card-game/shared-types';

/**
 * ATK/DEF bounds are rarity-specific (card-game-data 10, Q4): a common with
 * legendary-tier stats is exactly the review mistake this screen exists to
 * catch. The check lives here as a small pure function so both the panel UI
 * and the test suite call the same logic, and so a change to
 * `RARITY_META[r].statRange` in shared-types is caught by a failing test
 * instead of a silent drift between the two.
 */
export interface StatRangeCheck {
  min: number;
  max: number;
  attackInRange: boolean;
  defenseInRange: boolean;
}

export function checkStatRange(rarity: Rarity, attack: number, defense: number): StatRangeCheck {
  const [min, max] = RARITY_META[rarity].statRange;
  return {
    min,
    max,
    attackInRange: attack >= min && attack <= max,
    defenseInRange: defense >= min && defense <= max,
  };
}

/**
 * Picks the midpoint of the rarity's range rather than `min` — a value that
 * reads as "a typical card of this rarity" instead of a bare-minimum one,
 * while still always landing inside the inclusive range.
 */
export function autofillStatForRarity(rarity: Rarity): number {
  const [min, max] = RARITY_META[rarity].statRange;
  return Math.round((min + max) / 2);
}

/**
 * ARCHETYPE_RARITIES (card.d.ts) is data, not convention: dragon is
 * legendary/mythic only, slime and potion are common only, sword is
 * common/uncommon, crystal is uncommon/rare. A rarity edit that puts a card
 * outside its archetype's allowed band is exactly the mistake this screen
 * exists to catch (same reasoning as checkStatRange above) — so this is
 * checked the same way: a small pure function shared by the panel UI and the
 * test suite, driven by shared-types data rather than a hardcoded list that
 * would silently miss `dragon`/`slime`/`sword`/`potion`/`crystal`.
 */
export function isArchetypeRarityAllowed(archetype: Archetype, rarity: Rarity): boolean {
  return (ARCHETYPE_RARITIES[archetype] as readonly Rarity[]).includes(rarity);
}
