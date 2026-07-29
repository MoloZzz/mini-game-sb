import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import type { CardDto } from '@card-game/shared-types';

import { CardGrid } from '@/components/card/CardGrid';
import { CardTile, LockedCardTile } from '@/components/card/CardTile';

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
