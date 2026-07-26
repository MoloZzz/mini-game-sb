import {
  RARITIES,
  RARITY_META,
  type CollectionProgressDto,
  type InventoryItemDto,
  type Rarity,
} from '@card-game/shared-types';

/**
 * There is no `/collection-progress` endpoint in the API contract — progress
 * is derived client-side from the inventory the player already has, grouped
 * by distinct card (not by instance: 5 copies of one card is still 1 owned).
 */
export function computeCollectionProgress(items: InventoryItemDto[]): CollectionProgressDto {
  const ownedByRarity: Record<Rarity, number> = {
    common: 0,
    uncommon: 0,
    rare: 0,
    epic: 0,
    legendary: 0,
    mythic: 0,
  };

  for (const item of items) {
    ownedByRarity[item.card.rarity] += 1;
  }

  const byRarity = {} as CollectionProgressDto['byRarity'];
  let owned = 0;
  let total = 0;

  for (const rarity of RARITIES) {
    const rarityOwned = ownedByRarity[rarity];
    const rarityTotal = RARITY_META[rarity].poolTarget;
    byRarity[rarity] = { owned: rarityOwned, total: rarityTotal };
    owned += rarityOwned;
    total += rarityTotal;
  }

  return { owned, total, byRarity };
}
