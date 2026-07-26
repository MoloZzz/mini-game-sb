import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import {
  RARITIES,
  RARITY_META,
  type CardDto,
  type InventoryItemDto,
  type Rarity,
} from '@card-game/shared-types';

import { CardDetail } from '../CardDetail';

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

describe('CardDetail', () => {
  it('hides the sell button when the player owns only one copy', () => {
    render(<CardDetail item={buildItem('common', 1)} onSell={() => {}} selling={false} sellError={null} />);

    expect(screen.queryByRole('button', { name: /sell/i })).not.toBeInTheDocument();
    expect(screen.getByText(/only copy/i)).toBeInTheDocument();
  });

  it('shows the sell button when the player owns multiple copies', () => {
    render(<CardDetail item={buildItem('common', 2)} onSell={() => {}} selling={false} sellError={null} />);

    expect(screen.getByRole('button', { name: /sell/i })).toBeInTheDocument();
    expect(screen.queryByText(/only copy/i)).not.toBeInTheDocument();
  });

  it('shows the correct sell value for every rarity, sourced from RARITY_META', () => {
    for (const rarity of RARITIES) {
      const { unmount } = render(
        <CardDetail item={buildItem(rarity, 2)} onSell={() => {}} selling={false} sellError={null} />,
      );

      const expectedValue = RARITY_META[rarity].sellValue;
      expect(screen.getByRole('button', { name: /sell/i })).toHaveTextContent(String(expectedValue));

      unmount();
    }
  });

  it('requires a confirm click before calling onSell', async () => {
    const user = userEvent.setup();
    const onSell = vi.fn();
    render(<CardDetail item={buildItem('common', 2)} onSell={onSell} selling={false} sellError={null} />);

    await user.click(screen.getByRole('button', { name: /sell/i }));
    expect(onSell).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: /confirm sell/i }));
    expect(onSell).toHaveBeenCalledTimes(1);
    expect(onSell).toHaveBeenCalledWith('instance-common');
  });

  it('renders exactly one <img> element (ADR-005: only the art window is an image)', () => {
    const { container } = render(
      <CardDetail item={buildItem('common', 1)} onSell={() => {}} selling={false} sellError={null} />,
    );

    expect(container.querySelectorAll('img')).toHaveLength(1);
  });
});
