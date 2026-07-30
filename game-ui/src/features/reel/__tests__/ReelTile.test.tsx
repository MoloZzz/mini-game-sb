import { render } from '@testing-library/react';

import { cardsByRarity } from '@/mocks/fixtures/cards';

import { EAGER_REEL_TILE_COUNT, ReelTile } from '../ReelTile';

describe('ReelTile image loading priority', () => {
  const card = cardsByRarity.rare[0]!;
  const tile = {
    id: card.id,
    name: card.name,
    rarity: card.rarity,
    thumbUrl: card.imageUrl,
  };

  it('eagerly loads the initially visible strip with high priority', () => {
    const { container } = render(<ReelTile tile={tile} index={0} />);
    const image = container.querySelector('img');

    expect(image).toHaveAttribute('loading', 'eager');
    expect(image).toHaveAttribute('fetchpriority', 'high');
    expect(image).toHaveAttribute('decoding', 'async');
  });

  it('keeps later tiles lazy and low priority until the warmup reaches them', () => {
    const { container } = render(<ReelTile tile={tile} index={EAGER_REEL_TILE_COUNT} />);
    const image = container.querySelector('img');

    expect(image).toHaveAttribute('loading', 'lazy');
    expect(image).toHaveAttribute('fetchpriority', 'low');
    expect(image).toHaveAttribute('decoding', 'async');
  });
});
