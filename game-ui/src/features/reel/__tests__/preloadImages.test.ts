import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  preloadImages,
  scheduleImageWarmup,
  splitReelThumbs,
} from '../preloadImages';

type Mode = 'load' | 'error' | 'never';

class StubImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  private _src = '';

  constructor(private mode: (url: string) => Mode) {}

  set src(value: string) {
    this._src = value;
    const mode = this.mode(value);
    if (mode === 'never') return;
    // Fire asynchronously, like a real network/image load would.
    queueMicrotask(() => {
      if (mode === 'load') this.onload?.();
      else this.onerror?.();
    });
  }

  get src(): string {
    return this._src;
  }
}

describe('preloadImages', () => {
  let originalImage: typeof Image;

  beforeEach(() => {
    originalImage = globalThis.Image;
  });

  afterEach(() => {
    globalThis.Image = originalImage;
    vi.useRealTimers();
  });

  it('resolves immediately for an empty list', async () => {
    const ctor = vi.fn();
    globalThis.Image = class extends StubImage {
      constructor() {
        super(() => 'load');
        ctor();
      }
    } as unknown as typeof Image;

    await expect(preloadImages([])).resolves.toBeUndefined();
    expect(ctor).not.toHaveBeenCalled();
  });

  it('resolves when every image loads successfully', async () => {
    globalThis.Image = class extends StubImage {
      constructor() {
        super(() => 'load');
      }
    } as unknown as typeof Image;

    await expect(preloadImages(['a.png', 'b.png', 'c.png'])).resolves.toBeUndefined();
  });

  it('resolves when an image fails to load — onerror must resolve, not hang', async () => {
    globalThis.Image = class extends StubImage {
      constructor() {
        super(() => 'error');
      }
    } as unknown as typeof Image;

    await expect(preloadImages(['broken.png'])).resolves.toBeUndefined();
  });

  it('resolves with a mix of success and failure', async () => {
    globalThis.Image = class extends StubImage {
      constructor() {
        super((url) => (url.includes('bad') ? 'error' : 'load'));
      }
    } as unknown as typeof Image;

    await expect(preloadImages(['good1.png', 'bad.png', 'good2.png'])).resolves.toBeUndefined();
  });

  it('de-duplicates repeated URLs — constructs the stub once per unique URL', async () => {
    const ctor = vi.fn();
    globalThis.Image = class extends StubImage {
      constructor() {
        super(() => 'load');
        ctor();
      }
    } as unknown as typeof Image;

    await preloadImages(['dup.png', 'dup.png', 'other.png', 'dup.png']);
    expect(ctor).toHaveBeenCalledTimes(2);
  });

  it('resolves via the timeout when an image never fires either callback', async () => {
    vi.useFakeTimers();
    globalThis.Image = class extends StubImage {
      constructor() {
        super(() => 'never');
      }
    } as unknown as typeof Image;

    let resolved = false;
    void preloadImages(['stuck.png'], { timeoutMs: 5000 }).then(() => {
      resolved = true;
    });

    await vi.advanceTimersByTimeAsync(4999);
    expect(resolved).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    expect(resolved).toBe(true);
  });

  it('requests async decoding and forwards the requested network priority', async () => {
    let image!: StubImage & { decoding: string; fetchPriority: string };
    globalThis.Image = class extends StubImage {
      decoding = 'auto';
      fetchPriority = 'auto';

      constructor() {
        super(() => 'load');
        image = this;
      }
    } as unknown as typeof Image;

    await preloadImages(['thumb.png'], { fetchPriority: 'high' });

    expect(image.decoding).toBe('async');
    expect(image.fetchPriority).toBe('high');
  });
});

describe('scheduleImageWarmup', () => {
  it('defers and processes unique thumbnails in bounded sequential batches', async () => {
    vi.useFakeTimers();
    const requested: string[] = [];
    globalThis.Image = class extends StubImage {
      constructor() {
        super(() => 'load');
      }

      set src(value: string) {
        requested.push(value);
        super.src = value;
      }
    } as unknown as typeof Image;

    const cancel = scheduleImageWarmup(['a.png', 'b.png', 'b.png', 'c.png', 'd.png', 'e.png'], {
      batchSize: 2,
      batchDelayMs: 50,
    });

    expect(requested).toEqual([]);
    await vi.advanceTimersByTimeAsync(49);
    expect(requested).toEqual([]);

    await vi.advanceTimersByTimeAsync(1);
    expect(requested).toEqual(['a.png', 'b.png']);

    await vi.advanceTimersByTimeAsync(50);
    expect(requested).toEqual(['a.png', 'b.png', 'c.png', 'd.png']);

    await vi.advanceTimersByTimeAsync(50);
    expect(requested).toEqual(['a.png', 'b.png', 'c.png', 'd.png', 'e.png']);
    cancel();
  });

  it('cancels queued work when the spin is replaced', async () => {
    vi.useFakeTimers();
    const ctor = vi.fn();
    globalThis.Image = class extends StubImage {
      constructor() {
        super(() => 'load');
        ctor();
      }
    } as unknown as typeof Image;

    const cancel = scheduleImageWarmup(['a.png', 'b.png'], { batchDelayMs: 50 });
    cancel();
    await vi.advanceTimersByTimeAsync(100);

    expect(ctor).not.toHaveBeenCalled();
  });
});

describe('splitReelThumbs', () => {
  const urls = Array.from({ length: 60 }, (_, i) => `t${i}.png`);

  it('gates only on the tiles visible at x = 0 plus a small buffer', () => {
    // 1000px / PITCH(152) = 6.6 -> 7 visible, +2 buffer.
    const { critical, rest } = splitReelThumbs(urls, 1000);
    expect(critical).toHaveLength(9);
    expect(rest).toHaveLength(51);
    expect(critical[0]).toBe('t0.png');
    expect(rest[0]).toBe('t9.png');
  });

  it('never drops a tile — the two halves reassemble the strip', () => {
    const { critical, rest } = splitReelThumbs(urls, 1280);
    expect([...critical, ...rest]).toEqual(urls);
  });

  it('falls back to the whole strip when the container has not been measured', () => {
    // A zero width means layout is unknown; guessing "nothing is visible"
    // would start the spin over an empty viewport.
    const { critical, rest } = splitReelThumbs(urls, 0);
    expect(critical).toEqual(urls);
    expect(rest).toEqual([]);
  });

  it('handles a container wider than the whole strip', () => {
    const { critical, rest } = splitReelThumbs(urls, 100000);
    expect(critical).toEqual(urls);
    expect(rest).toEqual([]);
  });
});
