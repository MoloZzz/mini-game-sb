import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import { RARITIES, type CollectionProgressDto, type Rarity } from '@card-game/shared-types';

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

/**
 * Deliberately NOT 110 (the old hardcoded pool total) — these totals exist
 * only to prove the component renders exactly what the server payload says,
 * with nothing hardcoded on the client. One owned card per rarity keeps
 * every "owned / total" row textually distinct.
 */
const FAKE_RARITY_TOTALS: Record<Rarity, number> = {
  common: 180,
  uncommon: 108,
  rare: 64,
  epic: 35,
  legendary: 30,
  mythic: 15,
};

function buildProgress(): CollectionProgressDto {
  const byRarity = {} as CollectionProgressDto['byRarity'];
  let owned = 0;
  let total = 0;
  for (const rarity of RARITIES) {
    const rarityTotal = FAKE_RARITY_TOTALS[rarity];
    byRarity[rarity] = { owned: 1, total: rarityTotal };
    owned += 1;
    total += rarityTotal;
  }
  return { owned, total, byRarity };
}

describe('CollectionProgress', () => {
  it('shows the headline total from the server payload, not a client constant', () => {
    const progress = buildProgress();
    render(<CollectionProgress progress={progress} />);

    expect(screen.getByText(`${progress.owned} / ${progress.total}`)).toBeInTheDocument();
  });

  it('shows a per-rarity row whose total equals progress.byRarity[r].total, for every rarity', () => {
    const progress = buildProgress();
    render(<CollectionProgress progress={progress} />);

    for (const rarity of RARITIES) {
      const expectedTotal = progress.byRarity[rarity].total;
      // Fails loudly if a future change to the server payload isn't reflected
      // in the rendered breakdown — the assertion is built from the payload
      // itself, not a hardcoded number.
      expect(screen.getByText(`1 / ${expectedTotal}`)).toBeInTheDocument();
    }
  });

  it("sums every rarity's byRarity total to the headline total", () => {
    const progress = buildProgress();
    const sum = RARITIES.reduce((acc, r) => acc + progress.byRarity[r].total, 0);
    expect(sum).toBe(progress.total);
  });
});
