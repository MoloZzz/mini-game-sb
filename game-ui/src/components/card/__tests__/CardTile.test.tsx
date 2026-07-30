import { useMemo, useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { CardDto } from '@card-game/shared-types';

import { CardGrid } from '@/components/card/CardGrid';
import { CardTile, LockedCardTile } from '@/components/card/CardTile';

const { cardArtRender } = vi.hoisted(() => ({ cardArtRender: vi.fn() }));

vi.mock('../CardArt', () => ({
  CardArt: () => {
    cardArtRender();
    return <div data-testid="card-art" />;
  },
}));

const CARD: CardDto = {
  id: 'card-1',
  slug: 'storm-falcon',
  name: 'Storm Falcon',
  rarity: 'rare',
  element: 'air',
  archetype: 'beast',
  attack: 7,
  defense: 6,
  flavorText: null,
  imageUrl: '/mock/art/rare-1.svg',
  thumbUrl: '/mock/thumbs/rare-1.svg',
};

const SECOND_CARD: CardDto = { ...CARD, id: 'card-2', slug: 'ash-sprite', name: 'Ash Sprite' };
const THIRD_CARD: CardDto = { ...CARD, id: 'card-3', slug: 'thorn-wolf', name: 'Thorn Wolf' };
const GRID_CARDS = [CARD, SECOND_CARD, THIRD_CARD];

beforeEach(() => {
  cardArtRender.mockClear();
});

describe('CardTile', () => {
  it('shows the card name and its element/archetype meta line', () => {
    render(<CardTile card={CARD} />);

    expect(screen.getByText('Storm Falcon')).toBeInTheDocument();
    expect(screen.getByText('air · beast')).toBeInTheDocument();
  });

  it('calls onSelect when clicked and reports its selected state', () => {
    const onSelect = vi.fn();
    const { rerender } = render(<CardTile card={CARD} onSelect={onSelect} />);

    const tile = screen.getByRole('button');
    expect(tile).toHaveAttribute('aria-pressed', 'false');
    tile.click();
    expect(onSelect).toHaveBeenCalledTimes(1);

    rerender(<CardTile card={CARD} onSelect={onSelect} selected />);
    expect(screen.getByRole('button')).toHaveAttribute('aria-pressed', 'true');
  });

  it('renders the badge slot over the art — the inventory uses it for the copies count', () => {
    render(<CardTile card={CARD} badge={<span>×3</span>} />);
    expect(screen.getByText('×3')).toBeInTheDocument();
  });

  it('rerenders only the selected tile when stable grid props change selection', async () => {
    const user = userEvent.setup();

    function StableGrid() {
      const [selectedId, setSelectedId] = useState<string | null>(null);
      const tiles = useMemo(
        () =>
          GRID_CARDS.map((card) => ({
            card,
            onSelect: () => setSelectedId(card.id),
            badge: card.id === CARD.id ? <span>×3</span> : undefined,
          })),
        [],
      );

      return (
        <>
          <CardGrid>
            {tiles.map(({ card, onSelect, badge }) => (
              <CardTile
                key={card.id}
                card={card}
                selected={card.id === selectedId}
                onSelect={onSelect}
                badge={badge}
              />
            ))}
          </CardGrid>
          {selectedId && <button onClick={() => setSelectedId(null)}>Close details</button>}
        </>
      );
    }

    render(<StableGrid />);
    expect(cardArtRender).toHaveBeenCalledTimes(3);

    await user.click(screen.getByRole('button', { name: /Ash Sprite/ }));
    expect(screen.getByRole('button', { name: /Ash Sprite/ })).toHaveAttribute('aria-pressed', 'true');
    expect(cardArtRender).toHaveBeenCalledTimes(4);

    await user.click(screen.getByRole('button', { name: 'Close details' }));
    expect(cardArtRender).toHaveBeenCalledTimes(5);
  });
});

describe('LockedCardTile', () => {
  it('leaks nothing but the rarity — no name, no image, and it is not clickable', () => {
    render(
      <CardGrid>
        <CardTile key="a" card={CARD} onSelect={() => {}} />
        <LockedCardTile key="b" rarity="mythic" />
      </CardGrid>,
    );

    expect(screen.getByText('mythic')).toBeInTheDocument();
    expect(screen.getByText('?')).toBeInTheDocument();
    // Only the owned tile is a button; a locked slot has nothing to open.
    expect(screen.getAllByRole('button')).toHaveLength(1);
  });
});
