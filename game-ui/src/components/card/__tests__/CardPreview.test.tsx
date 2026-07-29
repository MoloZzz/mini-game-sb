import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { RARITY_META } from '@card-game/shared-types';

import { cardsByRarity } from '@/mocks/fixtures/cards';
import { CARD_PREVIEW_WIDTHS, CardPreview } from '@/components/card/CardPreview';

describe('CardPreview', () => {
  it('renders name, ATK, DEF and flavour text', () => {
    const card = cardsByRarity.rare[0]!;
    render(<CardPreview card={card} />);

    expect(screen.getByText(card.name)).toBeInTheDocument();
    expect(screen.getByText(`ATK ${card.attack}`)).toBeInTheDocument();
    expect(screen.getByText(`DEF ${card.defense}`)).toBeInTheDocument();
    expect(card.flavorText).not.toBeNull();
    expect(screen.getByText(card.flavorText!)).toBeInTheDocument();
  });

  it('omits the flavour row when flavorText is null', () => {
    const card = { ...cardsByRarity.common[0]!, flavorText: null };
    const { container } = render(<CardPreview card={card} />);

    expect(container.querySelector('p.italic')).toBeNull();
  });

  it('omits the element from the meta line when element is null, without rendering "null"', () => {
    const card = { ...cardsByRarity.epic[0]!, element: null };
    render(<CardPreview card={card} showMeta />);

    expect(screen.getByText(card.archetype, { exact: false })).toBeInTheDocument();
    expect(screen.queryByText(/null/i)).not.toBeInTheDocument();
  });

  it("the frame's border colour is RARITY_META[rarity].color", () => {
    const card = cardsByRarity.legendary[0]!;
    const { container } = render(<CardPreview card={card} />);

    const frame = container.firstElementChild as HTMLElement;
    expect(frame).toHaveStyle({ borderColor: RARITY_META.legendary.color });
  });

  it('renders exactly one <img> (ADR-005: the frame is DOM, not part of the picture)', () => {
    const card = cardsByRarity.mythic[0]!;
    const { container } = render(<CardPreview card={card} />);

    expect(container.querySelectorAll('img').length).toBe(1);
  });

  it('swaps in a rarity-tinted initials placeholder when the art window image fails to load', () => {
    // Real art doesn't exist yet — every card in this session renders through
    // a placeholder SVG, so this path (broken/missing image) is not an edge
    // case here, it's the common case.
    const card = cardsByRarity.legendary[0]!; // "Ember Drake"
    const { container } = render(<CardPreview card={card} />);

    fireEvent.error(screen.getByRole('img', { name: card.name }));

    expect(container.querySelectorAll('img').length).toBe(0);
    expect(screen.getByText('ED')).toBeInTheDocument();
    // The fallback block keeps the card's accessible name, so a failed image
    // is still announced as that card rather than as an unlabelled box.
    expect(screen.getByRole('img', { name: card.name })).toBeInTheDocument();
  });

  it('gives one size exactly one width — the inventory and collection cannot drift apart again', () => {
    const card = cardsByRarity.rare[0]!;

    // The regression guard for the original bug: the same card rendered a
    // 220px frame with a 480px zoom in the bag, and a 220px frame with a
    // 560px zoom in the dex. Both screens now ask for a size, not a number.
    const inventory = render(<CardPreview card={card} size="md" />);
    const inventoryWidth = (inventory.container.firstElementChild as HTMLElement).style.width;
    inventory.unmount();

    const collection = render(<CardPreview card={card} size="md" />);
    const collectionWidth = (collection.container.firstElementChild as HTMLElement).style.width;

    expect(inventoryWidth).toBe(collectionWidth);
    expect(inventoryWidth).toBe(`${CARD_PREVIEW_WIDTHS.md}px`);
  });

  it('only turns the art window into a zoom trigger when a handler is supplied', () => {
    const card = cardsByRarity.rare[0]!;

    const { unmount } = render(<CardPreview card={card} />);
    expect(screen.queryByRole('button', { name: /view full size/i })).not.toBeInTheDocument();
    unmount();

    render(<CardPreview card={card} onArtClick={() => {}} />);
    expect(screen.getByRole('button', { name: /view full size/i })).toBeInTheDocument();
  });
});
