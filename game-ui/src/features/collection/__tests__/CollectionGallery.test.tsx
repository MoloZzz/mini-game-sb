import { describe, expect, it } from 'vitest';
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
    render(<CollectionGallery items={[OWNED]} />);
    expect(screen.getByText('Storm Falcon')).toBeInTheDocument();
  });

  it('never renders a name, image alt text, or archetype/element for a locked card — only its rarity', () => {
    render(<CollectionGallery items={[LOCKED]} />);

    expect(screen.getByText('mythic')).toBeInTheDocument();
    expect(screen.getByText('?')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('renders one tile per entry, locked and unlocked mixed', () => {
    render(<CollectionGallery items={[OWNED, LOCKED]} />);

    expect(screen.getByText('Storm Falcon')).toBeInTheDocument();
    expect(screen.getByText('mythic')).toBeInTheDocument();
  });
});
