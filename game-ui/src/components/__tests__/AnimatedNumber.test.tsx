import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';

import { AnimatedNumber } from '../AnimatedNumber';

// jsdom lacks matchMedia; usePrefersReducedMotion guards for this in the
// real hook, but stub it so the "OS setting" branch is exercised on purpose
// rather than falling back silently.
function stubMatchMedia(reduced = false) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: reduced,
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
  stubMatchMedia(false);
});

afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

describe('AnimatedNumber', () => {
  it('renders the initial value immediately, with no tween on first mount', () => {
    const { container } = render(<AnimatedNumber value={1234} />);
    expect(container.textContent).toBe('1,234');
  });

  it('reaches the final value after the tween duration elapses', async () => {
    vi.useFakeTimers();
    const { container, rerender } = render(<AnimatedNumber value={0} durationMs={300} />);
    expect(container.textContent).toBe('0');

    rerender(<AnimatedNumber value={1000} durationMs={300} />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    expect(container.textContent).toBe('1,000');
  });

  it('snaps instead of tweening when prefers-reduced-motion is set', async () => {
    stubMatchMedia(true);
    const { container, rerender } = render(<AnimatedNumber value={0} durationMs={5000} />);

    rerender(<AnimatedNumber value={42} durationMs={5000} />);

    // No timer advance at all — a tween would still show 0 here.
    expect(container.textContent).toBe('42');
  });

  it('cleans up its animation frame on unmount without warnings', async () => {
    vi.useFakeTimers();
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { rerender, unmount } = render(<AnimatedNumber value={0} durationMs={300} />);
    rerender(<AnimatedNumber value={500} durationMs={300} />);

    // Unmount mid-animation — cleanup must cancel the pending frame instead
    // of letting a later tick call setState on an unmounted component.
    expect(() => unmount()).not.toThrow();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
