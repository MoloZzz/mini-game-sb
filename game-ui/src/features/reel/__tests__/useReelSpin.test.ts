import type { RefObject } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';

import { POST_STOP_PAUSE_MS } from '@card-game/shared-types';
import { cardsByRarity } from '@/mocks/fixtures/cards';
import { buildReel } from '@/mocks/fixtures/reel';

import { useReelSpin } from '../useReelSpin';

function stubMatchMedia() {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
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
    queueMicrotask(() => this.onload?.());
  }
}

function fakeContainerRef(width: number): RefObject<HTMLElement | null> {
  return { current: { getBoundingClientRect: () => ({ width }) } as unknown as HTMLElement };
}

beforeEach(() => {
  stubMatchMedia();
  globalThis.Image = StubImage as unknown as typeof Image;
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useReelSpin', () => {
  it('resets targetX to 0 for every new spinId, before the new target is known', async () => {
    vi.useFakeTimers();
    const containerRef = fakeContainerRef(1024);
    const onLanded = vi.fn();

    const cardA = cardsByRarity.rare[1]!;
    const cardB = cardsByRarity.uncommon[4]!;
    const reelA = buildReel(cardA, () => 0.4);
    const reelB = buildReel(cardB, () => 0.6);

    const { result, rerender } = renderHook(
      (props: { reel: typeof reelA; spinId: string }) =>
        useReelSpin({ ...props, containerRef, onLanded, forceReducedMotion: true }),
      { initialProps: { reel: reelA, spinId: 'spin-a' } },
    );

    // Let spin A resolve fully — targetX should now sit at a large negative
    // offset (the frozen geometry for spin A), never 0.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(POST_STOP_PAUSE_MS);
    });
    expect(result.current.phase).toBe('done');
    expect(result.current.targetX).not.toBe(0);
    const targetA = result.current.targetX;

    // Starting spin B must synchronously snap back to x=0 — without this,
    // a repeat opening would visually jump from wherever spin A stopped
    // instead of running the full 0 -> target sweep the spec requires.
    rerender({ reel: reelB, spinId: 'spin-b' });
    expect(result.current.targetX).toBe(0);
    expect(result.current.phase).toBe('preloading');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(POST_STOP_PAUSE_MS);
    });
    expect(result.current.phase).toBe('done');
    expect(result.current.targetX).not.toBe(0);
    expect(result.current.targetX).not.toBe(targetA);
    expect(onLanded).toHaveBeenCalledTimes(2);
  });
});
