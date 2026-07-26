import { describe, expect, it } from 'vitest';
import { POOL_TARGET_TOTAL, RARITIES, RARITY_META, type InventoryItemDto } from '@card-game/shared-types';

import { MOCK_CARDS } from '../../mocks/fixtures/cards';
import { computeCollectionProgress } from '../collection';

function itemFor(cardId: string, copies: number): InventoryItemDto {
  const card = MOCK_CARDS.find((c) => c.id === cardId);
  if (!card) throw new Error(`Unknown mock card id: ${cardId}`);
  return { instanceId: `inst-${cardId}`, card, acquiredAt: new Date().toISOString(), copies };
}

describe('computeCollectionProgress', () => {
  it('totals per rarity match RARITY_META poolTarget, and total sums to POOL_TARGET_TOTAL', () => {
    const progress = computeCollectionProgress([]);

    expect(progress.total).toBe(POOL_TARGET_TOTAL);
    for (const rarity of RARITIES) {
      expect(progress.byRarity[rarity].total).toBe(RARITY_META[rarity].poolTarget);
    }

    const summedTotal = RARITIES.reduce((sum, r) => sum + progress.byRarity[r].total, 0);
    expect(summedTotal).toBe(POOL_TARGET_TOTAL);
  });

  it('reports zero owned for an empty inventory', () => {
    const progress = computeCollectionProgress([]);
    expect(progress.owned).toBe(0);
    for (const rarity of RARITIES) {
      expect(progress.byRarity[rarity].owned).toBe(0);
    }
  });

  it('counts owned per distinct card, not per instance', () => {
    const items = [
      // Five copies of the same common card must still count as 1 owned.
      itemFor('mock-common-1', 5),
      itemFor('mock-common-2', 1),
      itemFor('mock-legendary-1', 3),
    ];

    const progress = computeCollectionProgress(items);

    expect(progress.owned).toBe(3);
    expect(progress.byRarity.common.owned).toBe(2);
    expect(progress.byRarity.legendary.owned).toBe(1);
    expect(progress.byRarity.rare.owned).toBe(0);
  });
});
