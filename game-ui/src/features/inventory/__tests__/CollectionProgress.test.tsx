import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import { POOL_TARGET_TOTAL, RARITIES, RARITY_META, type CollectionProgressDto } from '@card-game/shared-types';

import { CollectionProgress } from '../CollectionProgress';

function stubMatchMedia() {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

beforeEach(() => {
  stubMatchMedia();
});

/** One owned card per rarity — keeps every "owned / total" row textually
 * distinct since each rarity's poolTarget differs. */
function buildProgress(): CollectionProgressDto {
  const byRarity = {} as CollectionProgressDto['byRarity'];
  let owned = 0;
  for (const rarity of RARITIES) {
    const total = RARITY_META[rarity].poolTarget;
    byRarity[rarity] = { owned: 1, total };
    owned += 1;
  }
  return { owned, total: POOL_TARGET_TOTAL, byRarity };
}

describe('CollectionProgress', () => {
  it('shows the headline total against POOL_TARGET_TOTAL', () => {
    const progress = buildProgress();
    render(<CollectionProgress progress={progress} />);

    expect(screen.getByText(`${progress.owned} / ${POOL_TARGET_TOTAL}`)).toBeInTheDocument();
  });

  it('shows a per-rarity row whose total equals RARITY_META[r].poolTarget, for every rarity', () => {
    const progress = buildProgress();
    render(<CollectionProgress progress={progress} />);

    for (const rarity of RARITIES) {
      const expectedTotal = RARITY_META[rarity].poolTarget;
      // Fails loudly if a future change to poolTarget isn't reflected in the
      // rendered breakdown — the assertion is built from RARITY_META itself,
      // not a hardcoded number.
      expect(screen.getByText(`1 / ${expectedTotal}`)).toBeInTheDocument();
    }
  });

  it("sums every rarity's poolTarget to POOL_TARGET_TOTAL", () => {
    const sum = RARITIES.reduce((acc, r) => acc + RARITY_META[r].poolTarget, 0);
    expect(sum).toBe(POOL_TARGET_TOTAL);
  });
});
