import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { CardDto } from '@card-game/shared-types';

import { CardDetailModal } from '@/components/card/CardDetailModal';

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

describe('CardDetailModal', () => {
  it('renders exactly one <img> until zoomed (ADR-005)', () => {
    const { container } = render(<CardDetailModal card={CARD} onClose={() => {}} />);
    expect(container.querySelectorAll('img')).toHaveLength(1);
  });

  it('opens a zoom overlay on the art, and Escape closes the zoom before the dialog', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<CardDetailModal card={CARD} onClose={onClose} />);

    expect(screen.getByRole('dialog', { name: /storm falcon preview/i })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /view full size/i }));
    const zoomDialog = screen.getByRole('dialog', { name: /storm falcon full size/i });
    expect(zoomDialog).toHaveClass('max-w-2xl');
    expect(screen.getAllByAltText('Storm Falcon')).toHaveLength(2);

    // Only the topmost dialog reacts — one Escape must not close both layers.
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: /full size/i })).not.toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes the preview from its close button', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<CardDetailModal card={CARD} onClose={onClose} />);

    await user.click(screen.getByRole('button', { name: /close preview/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('shows nothing about copies or selling unless the caller supplies a footer', () => {
    // The dex has no notion of instances, so it passes no footer at all.
    render(<CardDetailModal card={CARD} onClose={() => {}} />);

    expect(screen.queryByText(/sell/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/copies/i)).not.toBeInTheDocument();
  });

  it('renders a supplied footer inside the dialog', () => {
    render(<CardDetailModal card={CARD} onClose={() => {}} footer={<p>Copies owned: 3</p>} />);
    expect(screen.getByText('Copies owned: 3')).toBeInTheDocument();
  });
});
