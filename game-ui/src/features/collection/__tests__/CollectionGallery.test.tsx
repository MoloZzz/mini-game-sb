import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import type { CollectionCardDto } from '@card-game/shared-types';

import { CollectionGallery } from '../CollectionGallery';

const OWNED: CollectionCardDto = {
  id: 'card-1',
  rarity: 'rare',
  owned: true,
  card: {
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
  },
};

const LOCKED: CollectionCardDto = {
  id: 'card-2',
  rarity: 'mythic',
  owned: false,
  card: null,
};

describe('CollectionGallery', () => {
  it('shows the real name for an owned card', () => {
    render(<CollectionGallery items={[OWNED]} selectedId={null} onSelect={() => {}} />);
    expect(screen.getByText('Storm Falcon')).toBeInTheDocument();
  });

  it('never renders a name, image alt text, or archetype/element for a locked card — only its rarity', () => {
    render(<CollectionGallery items={[LOCKED]} selectedId={null} onSelect={() => {}} />);

    expect(screen.getByText('mythic')).toBeInTheDocument();
    expect(screen.getByText('?')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('renders one tile per entry, locked and unlocked mixed', () => {
    render(<CollectionGallery items={[OWNED, LOCKED]} selectedId={null} onSelect={() => {}} />);

    expect(screen.getByText('Storm Falcon')).toBeInTheDocument();
    expect(screen.getByText('mythic')).toBeInTheDocument();
  });

  it('calls onSelect with the entry when an owned tile is clicked, and only owned tiles are buttons', () => {
    const onSelect = vi.fn();
    render(<CollectionGallery items={[OWNED, LOCKED]} selectedId={null} onSelect={onSelect} />);

    expect(screen.getAllByRole('button')).toHaveLength(1);
    screen.getByRole('button').click();
    expect(onSelect).toHaveBeenCalledWith(OWNED);
  });

  it('marks the selected tile as pressed', () => {
    render(<CollectionGallery items={[OWNED]} selectedId="card-1" onSelect={() => {}} />);
    expect(screen.getByRole('button')).toHaveAttribute('aria-pressed', 'true');
  });
});
