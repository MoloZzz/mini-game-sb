import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { useReviewKeyboard, type ReviewKeyboardHandlers } from '../useReviewKeyboard';

// jsdom doesn't implement matchMedia; stubbed defensively even though this
// hook itself never reads it, matching the pattern used across the suite.
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

function makeHandlers(): ReviewKeyboardHandlers {
  return {
    next: vi.fn(),
    prev: vi.fn(),
    approve: vi.fn(),
    reject: vi.fn(),
    editName: vi.fn(),
    setRarityByIndex: vi.fn(),
    blurOrClose: vi.fn(),
    toggleCheatSheet: vi.fn(),
  };
}

function Harness({ handlers }: { handlers: ReviewKeyboardHandlers }) {
  useReviewKeyboard(handlers);
  return (
    <div>
      <input data-testid="name-input" />
      <button type="button">outside</button>
    </div>
  );
}

describe('useReviewKeyboard', () => {
  it('fires the matching handler for each bound key outside any field', async () => {
    const handlers = makeHandlers();
    render(<Harness handlers={handlers} />);

    await userEvent.keyboard('a');
    await userEvent.keyboard('r');
    await userEvent.keyboard('{ArrowRight}');
    await userEvent.keyboard('{ArrowLeft}');
    await userEvent.keyboard('e');
    await userEvent.keyboard('3');
    await userEvent.keyboard('?');

    expect(handlers.approve).toHaveBeenCalledTimes(1);
    expect(handlers.reject).toHaveBeenCalledTimes(1);
    expect(handlers.next).toHaveBeenCalledTimes(1);
    expect(handlers.prev).toHaveBeenCalledTimes(1);
    expect(handlers.editName).toHaveBeenCalledTimes(1);
    expect(handlers.setRarityByIndex).toHaveBeenCalledWith(2);
    expect(handlers.toggleCheatSheet).toHaveBeenCalledTimes(1);
  });

  // This is the bug that makes a screen like this unusable: without the
  // editable-target guard, typing a card name would approve/reject cards
  // and mangle rarity mid-keystroke.
  it('does not fire shortcuts while an <input> has focus', async () => {
    const handlers = makeHandlers();
    render(<Harness handlers={handlers} />);

    const input = screen.getByTestId('name-input');
    await userEvent.click(input);
    expect(input).toHaveFocus();

    await userEvent.keyboard('a');
    await userEvent.keyboard('r');
    await userEvent.keyboard('{ArrowRight}');
    await userEvent.keyboard('1');
    await userEvent.keyboard('?');
    await userEvent.keyboard('e');

    expect(handlers.approve).not.toHaveBeenCalled();
    expect(handlers.reject).not.toHaveBeenCalled();
    expect(handlers.next).not.toHaveBeenCalled();
    expect(handlers.setRarityByIndex).not.toHaveBeenCalled();
    expect(handlers.toggleCheatSheet).not.toHaveBeenCalled();
    expect(handlers.editName).not.toHaveBeenCalled();
  });

  it('still fires blurOrClose on Escape even while an input has focus', async () => {
    const handlers = makeHandlers();
    render(<Harness handlers={handlers} />);

    const input = screen.getByTestId('name-input');
    await userEvent.click(input);

    await userEvent.keyboard('{Escape}');

    expect(handlers.blurOrClose).toHaveBeenCalledTimes(1);
  });

  it('returns the same shortcut map the cheat sheet is meant to render from', () => {
    let returned: unknown;
    function Capture({ handlers }: { handlers: ReviewKeyboardHandlers }) {
      returned = useReviewKeyboard(handlers);
      return null;
    }
    render(<Capture handlers={makeHandlers()} />);

    expect(Array.isArray(returned)).toBe(true);
    expect((returned as unknown[]).length).toBeGreaterThan(0);
  });
});
