import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { RARITY_META } from '@card-game/shared-types';

import { cardsByRarity } from '@/mocks/fixtures/cards';
import { CardFrame } from '@/components/CardFrame';

// jsdom lacks matchMedia; CardFrame itself doesn't call it, but stub it anyway
// per the reveal feature's test convention so nothing downstream crashes.
beforeEach(() => {
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
});

describe('CardFrame', () => {
  it('renders name, ATK, DEF and flavour text', () => {
    const card = cardsByRarity.rare[0]!;
    render(<CardFrame card={card} />);

    expect(screen.getByText(card.name)).toBeInTheDocument();
    expect(screen.getByText(`ATK ${card.attack}`)).toBeInTheDocument();
    expect(screen.getByText(`DEF ${card.defense}`)).toBeInTheDocument();
    expect(card.flavorText).not.toBeNull();
    expect(screen.getByText(card.flavorText!)).toBeInTheDocument();
  });

  it('omits the flavour row when flavorText is null', () => {
    const card = { ...cardsByRarity.common[0]!, flavorText: null };
    const { container } = render(<CardFrame card={card} />);

    expect(container.querySelector('p.italic')).toBeNull();
  });

  it('omits the element from the meta line when element is null, without rendering "null"', () => {
    const card = { ...cardsByRarity.epic[0]!, element: null };
    render(<CardFrame card={card} />);

    expect(screen.getByText(card.archetype, { exact: false })).toBeInTheDocument();
    expect(screen.queryByText(/null/i)).not.toBeInTheDocument();
  });

  it("the frame's border colour is RARITY_META[rarity].color", () => {
    const card = cardsByRarity.legendary[0]!;
    const { container } = render(<CardFrame card={card} />);

    const frame = container.firstElementChild as HTMLElement;
    expect(frame).toHaveStyle({ borderColor: RARITY_META.legendary.color });
  });

  it('renders exactly one <img> (ADR-005: the frame is DOM, not part of the picture)', () => {
    const card = cardsByRarity.mythic[0]!;
    const { container } = render(<CardFrame card={card} />);

    expect(container.querySelectorAll('img').length).toBe(1);
  });

  it('swaps in a rarity-tinted initials placeholder when the art window image fails to load', () => {
    // Real art doesn't exist yet — every card in this session renders through
    // a placeholder SVG, so this path (broken/missing image) is not an edge
    // case here, it's the common case.
    const card = cardsByRarity.legendary[0]!; // "Ember Drake"
    render(<CardFrame card={card} />);

    const img = screen.getByRole('img', { name: card.name });
    fireEvent.error(img);

    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getByText('ED')).toBeInTheDocument();
  });
});
