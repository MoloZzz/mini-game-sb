import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, waitFor } from '@testing-library/react';

import { POST_STOP_PAUSE_MS, REEL_LENGTH, WINNING_INDEX } from '@card-game/shared-types';
import { cardsByRarity } from '@/mocks/fixtures/cards';
import { buildReel } from '@/mocks/fixtures/reel';

import { Reel } from '../Reel';

// jsdom doesn't implement matchMedia — usePrefersReducedMotion guards for
// this in the real hook, but stub it anyway so the "OS setting" branch is
// exercised deterministically rather than throwing.
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

class StubImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  set src(_value: string) {
    // Resolve promptly so preloadImages doesn't stall these tests.
    queueMicrotask(() => this.onload?.());
  }
}

beforeEach(() => {
  stubMatchMedia();
  globalThis.Image = StubImage as unknown as typeof Image;
});

afterEach(() => {
  vi.useRealTimers();
});

/** Lets the preloadImages promise chain (queued via microtasks) settle inside `act`. */
async function flushMicrotasks(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('Reel', () => {
  it('renders exactly REEL_LENGTH tiles', async () => {
    const wonCard = cardsByRarity.rare[0]!;
    const reel = buildReel(wonCard, () => 0.5);

    const { container } = render(<Reel reel={reel} spinId="spin-1" onLanded={() => {}} />);
    await flushMicrotasks();

    const tileEls = container.querySelectorAll('[data-reel-index]');
    expect(tileEls.length).toBe(REEL_LENGTH);
  });

  it('the winning tile carries the winning card id', async () => {
    const wonCard = cardsByRarity.epic[3]!;
    const reel = buildReel(wonCard, () => 0.5);

    const { container } = render(<Reel reel={reel} spinId="spin-2" onLanded={() => {}} />);
    await flushMicrotasks();

    const winnerEl = container.querySelector(`[data-reel-index="${WINNING_INDEX}"]`);
    expect(winnerEl).not.toBeNull();
    expect(winnerEl).toHaveAttribute('data-card-id', wonCard.id);
  });

  it('reduced-motion path lands without the 5.5s animation', async () => {
    vi.useFakeTimers();
    const wonCard = cardsByRarity.legendary[1]!;
    const reel = buildReel(wonCard, () => 0.3);
    const onLanded = vi.fn();

    await act(async () => {
      render(<Reel reel={reel} spinId="spin-reduced" onLanded={onLanded} forceReducedMotion />);
    });

    // Flush the preloadImages microtask so the skip decision fires.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(onLanded).not.toHaveBeenCalled();

    // Only the mandatory post-stop silence should stand between here and
    // onLanded — never the full SPIN_DURATION_MS.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(POST_STOP_PAUSE_MS);
    });
    expect(onLanded).toHaveBeenCalledTimes(1);
  });

  it('reduced-motion path still lands on the correct winning card', async () => {
    vi.useFakeTimers();
    const wonCard = cardsByRarity.mythic[0]!;
    const reel = buildReel(wonCard, () => 0.7);
    const onLanded = vi.fn();

    let container!: HTMLElement;
    await act(async () => {
      ({ container } = render(
        <Reel reel={reel} spinId="spin-reduced-2" onLanded={onLanded} forceReducedMotion />,
      ));
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(POST_STOP_PAUSE_MS);
    });
    expect(onLanded).toHaveBeenCalledTimes(1);

    const winnerEl = container.querySelector(`[data-reel-index="${WINNING_INDEX}"]`);
    expect(winnerEl).toHaveAttribute('data-card-id', wonCard.id);
  });

  it('uses the strip native transform transition to schedule landing', async () => {
    const wonCard = cardsByRarity.rare[0]!;
    const reel = buildReel(wonCard, () => 0.5);
    const onLanded = vi.fn();

    const { getByTestId } = render(<Reel reel={reel} spinId="spin-native-transition" onLanded={onLanded} />);
    const strip = getByTestId('reel-strip');
    await waitFor(() => {
      expect(strip.style.transition).toContain('transform');
    });

    const transitionEnd = new Event('transitionend', { bubbles: true });
    Object.defineProperty(transitionEnd, 'propertyName', { value: 'transform' });
    vi.useFakeTimers();
    fireEvent(strip, transitionEnd);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(POST_STOP_PAUSE_MS);
    });

    expect(onLanded).toHaveBeenCalledTimes(1);
  });

  it('only one element in the tree carries a transform, and no ReelTile has its own', async () => {
    const wonCard = cardsByRarity.common[2]!;
    const reel = buildReel(wonCard, () => 0.5);

    const { container } = render(<Reel reel={reel} spinId="spin-transform" onLanded={() => {}} />);
    await flushMicrotasks();

    const withInlineTransform = Array.from(container.querySelectorAll<HTMLElement>('*')).filter(
      (el) => el.style.transform !== '',
    );
    // The single strip (the motion.div Framer Motion animates) is the only
    // node that should carry an inline transform.
    expect(withInlineTransform.length).toBe(1);

    const tileEls = Array.from(container.querySelectorAll<HTMLElement>('[data-reel-index]'));
    expect(tileEls.length).toBeGreaterThan(0);
    for (const tile of tileEls) {
      expect(tile.style.transform).toBe('');
    }
  });

  it('renders a dimmed, same-height viewport with no tiles when reel is null', () => {
    const { container } = render(<Reel reel={null} spinId={null} onLanded={() => {}} />);

    expect(container.querySelectorAll('[data-reel-index]').length).toBe(0);
  });
});
