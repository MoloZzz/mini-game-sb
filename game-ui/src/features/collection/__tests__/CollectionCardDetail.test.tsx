import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { CardDto } from '@card-game/shared-types';

import { CollectionCardDetail } from '../CollectionCardDetail';

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

const CARD: CardDto = {
  id: 'card-1',
  slug: 'storm-falcon',
  name: 'Storm Falcon',
  rarity: 'rare',
  element: 'air',
  archetype: 'beast',
  attack: 7,
  defense: 6,
  flavorText: 'Fast and fierce.',
  imageUrl: '/mock/art/rare-1.svg',
  thumbUrl: '/mock/thumbs/rare-1.svg',
};

describe('CollectionCardDetail', () => {
  it('renders exactly one <img> element until zoomed', () => {
    const { container } = render(<CollectionCardDetail card={CARD} onClose={() => {}} />);
    expect(container.querySelectorAll('img')).toHaveLength(1);
  });

  it('opens a zoom overlay when the art is clicked, and closes it on the close button, backdrop click, or Escape', async () => {
    const user = userEvent.setup();
    render(<CollectionCardDetail card={CARD} onClose={() => {}} />);

    expect(screen.getByRole('dialog', { name: /storm falcon preview/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /close preview/i })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /view full size/i }));
    expect(screen.getByRole('button', { name: /^close$/i })).toBeInTheDocument();
    expect(screen.getAllByAltText('Storm Falcon')).toHaveLength(2);

    await user.click(screen.getByRole('button', { name: /^close$/i }));
    expect(screen.queryByRole('button', { name: /^close$/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /view full size/i }));
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('button', { name: /^close$/i })).not.toBeInTheDocument();
  });

  it('closes the preview when its close button is clicked or Escape is pressed', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<CollectionCardDetail card={CARD} onClose={onClose} />);

    await user.click(screen.getByRole('button', { name: /close preview/i }));
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('never mentions sell or copies (the dex has no notion of instances)', () => {
    render(<CollectionCardDetail card={CARD} onClose={() => {}} />);
    expect(screen.queryByText(/sell/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/copies/i)).not.toBeInTheDocument();
  });
});
