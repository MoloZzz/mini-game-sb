import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { WINNING_INDEX, type OpenCaseResponse } from '@card-game/shared-types';

import { cardsByRarity } from '@/mocks/fixtures/cards';
import { buildReel } from '@/mocks/fixtures/reel';

import { Reveal } from '../Reveal';

// jsdom lacks matchMedia — usePrefersReducedMotion guards for this in the real
// hook, but every reveal test stubs it anyway per the feature's convention.
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

function buildResult(overrides: Partial<OpenCaseResponse> = {}): OpenCaseResponse {
  const card = cardsByRarity.rare[0]!;
  return {
    dropId: 'drop-1',
    reel: buildReel(card, () => 0.5),
    winningIndex: WINNING_INDEX,
    wonCard: card,
    isDuplicate: false,
    copies: 1,
    balance: { coins: 1000, keys: 5 },
    ...overrides,
  };
}

describe('Reveal', () => {
  it('shows NEW when the card is not a duplicate', () => {
    render(<Reveal result={buildResult({ isDuplicate: false })} onAgain={() => {}} onToInventory={() => {}} />);
    expect(screen.getByText('NEW')).toBeInTheDocument();
  });

  it('shows ×N when the card is a duplicate', () => {
    render(
      <Reveal
        result={buildResult({ isDuplicate: true, copies: 3 })}
        onAgain={() => {}}
        onToInventory={() => {}}
      />,
    );
    expect(screen.getByText('×3')).toBeInTheDocument();
    expect(screen.queryByText('NEW')).not.toBeInTheDocument();
  });

  it('renders "Again" as the primary, autofocused button', () => {
    render(<Reveal result={buildResult()} onAgain={() => {}} onToInventory={() => {}} />);

    const again = screen.getByRole('button', { name: 'Again' });
    const toInventory = screen.getByRole('button', { name: 'To inventory' });

    expect(again).toBeInTheDocument();
    expect(again).toHaveFocus();
    // "Again" carries the primary variant's amber fill; "To inventory" must not —
    // the spec calls for a visually secondary pairing, not two matched buttons.
    expect(again.className).toContain('bg-amber-400');
    expect(toInventory.className).not.toContain('bg-amber-400');
  });

  it('calls onAgain when the Again button is clicked', () => {
    const onAgain = vi.fn();
    render(<Reveal result={buildResult()} onAgain={onAgain} onToInventory={() => {}} />);

    fireEvent.click(screen.getByRole('button', { name: 'Again' }));
    expect(onAgain).toHaveBeenCalledTimes(1);
  });

  it('calls onToInventory when Escape is pressed', () => {
    const onToInventory = vi.fn();
    render(<Reveal result={buildResult()} onAgain={() => {}} onToInventory={onToInventory} />);

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onToInventory).toHaveBeenCalledTimes(1);
  });

  it('also allows reaching "To inventory" via click, as a visually secondary button', () => {
    const onToInventory = vi.fn();
    render(<Reveal result={buildResult()} onAgain={() => {}} onToInventory={onToInventory} />);

    fireEvent.click(screen.getByRole('button', { name: 'To inventory' }));
    expect(onToInventory).toHaveBeenCalledTimes(1);
  });
});
