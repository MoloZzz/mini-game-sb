import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import {
  RARITIES,
  RARITY_META,
  type CardDto,
  type InventoryItemDto,
  type Rarity,
} from '@card-game/shared-types';

import { CardDetail } from '../CardDetail';

function buildItem(rarity: Rarity, copies: number): InventoryItemDto {
  const card: CardDto = {
    id: `test-${rarity}`,
    slug: `test-${rarity}`,
    name: `Test ${rarity}`,
    rarity,
    element: 'fire',
    archetype: 'beast',
    attack: 5,
    defense: 5,
    flavorText: 'A test card.',
    imageUrl: `/mock/art/${rarity}-1.svg`,
    thumbUrl: `/mock/thumbs/${rarity}-1.svg`,
  };
  return { instanceId: `instance-${rarity}`, card, acquiredAt: new Date().toISOString(), copies };
}

function renderDetail(item: InventoryItemDto, overrides: Partial<Parameters<typeof CardDetail>[0]> = {}) {
  return render(
    <CardDetail
      item={item}
      onClose={() => {}}
      onSell={() => {}}
      selling={false}
      sellError={null}
      {...overrides}
    />,
  );
}

describe('CardDetail', () => {
  it('hides the sell button when the player owns only one copy', () => {
    renderDetail(buildItem('common', 1));

    expect(screen.queryByRole('button', { name: /sell/i })).not.toBeInTheDocument();
    expect(screen.getByText(/only copy/i)).toBeInTheDocument();
  });

  it('shows the sell button when the player owns multiple copies', () => {
    renderDetail(buildItem('common', 2));

    expect(screen.getByRole('button', { name: /sell/i })).toBeInTheDocument();
    expect(screen.queryByText(/only copy/i)).not.toBeInTheDocument();
  });

  it('shows the correct sell value for every rarity, sourced from RARITY_META', () => {
    for (const rarity of RARITIES) {
      const { unmount } = renderDetail(buildItem(rarity, 2));

      const expectedValue = RARITY_META[rarity].sellValue;
      expect(screen.getByRole('button', { name: /sell/i })).toHaveTextContent(String(expectedValue));

      unmount();
    }
  });

  it('requires a confirm click before calling onSell', async () => {
    const user = userEvent.setup();
    const onSell = vi.fn();
    renderDetail(buildItem('common', 2), { onSell });

    await user.click(screen.getByRole('button', { name: /sell/i }));
    expect(onSell).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: /confirm sell/i }));
    expect(onSell).toHaveBeenCalledTimes(1);
    expect(onSell).toHaveBeenCalledWith('instance-common');
  });

  it('renders exactly one <img> element (ADR-005: only the art window is an image)', () => {
    const { container } = renderDetail(buildItem('common', 1));

    expect(container.querySelectorAll('img')).toHaveLength(1);
  });

  it('closes the dialog on its close button and on Escape', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderDetail(buildItem('common', 1), { onClose });

    await user.click(screen.getByRole('button', { name: /close preview/i }));
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('opens the shared zoom overlay from the art window', async () => {
    const user = userEvent.setup();
    renderDetail(buildItem('common', 1));

    expect(screen.queryByRole('dialog', { name: /full size/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /view full size/i }));

    expect(screen.getByRole('dialog', { name: /full size/i })).toBeInTheDocument();
    // The zoom overlay shows a second, larger copy of the same art.
    expect(screen.getAllByAltText('Test common')).toHaveLength(2);
  });
});
