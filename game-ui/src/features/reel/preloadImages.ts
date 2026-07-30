import { PITCH } from '@card-game/shared-types';

/**
 * How long the spin may be held back waiting for the first screenful of
 * thumbs. Beyond this the stall reads as a broken button, which is worse
 * than a tile or two fading in — so we start regardless.
 */
export const CRITICAL_PRELOAD_TIMEOUT_MS = 400;

/**
 * The queue adds only a small group of thumbnails at a time after the reel
 * begins moving. This keeps the network and image decoder available for the
 * first painted frames while still warming the whole, fixed 60-tile strip
 * well before it reaches the winning card.
 */
export const WARMUP_BATCH_SIZE = 6;
export const WARMUP_BATCH_DELAY_MS = 80;
export const WARMUP_BATCH_TIMEOUT_MS = 750;

/** A couple of tiles past the right edge, so the first frames of scroll are covered. */
const CRITICAL_BUFFER_TILES = 2;

export interface ImagePreloadOptions {
  /** Resolves even if the request or decode stalls, so the UI never wedges. */
  timeoutMs?: number;
  /** Lets the browser reserve bandwidth for the currently visible strip. */
  fetchPriority?: 'high' | 'low' | 'auto';
}

export interface ImageWarmupOptions {
  batchSize?: number;
  batchDelayMs?: number;
  batchTimeoutMs?: number;
}

/**
 * Splits the strip into what must be on screen now and what the spin has
 * seconds to fetch.
 */
export function splitReelThumbs(
  urls: readonly string[],
  containerW: number,
): { critical: string[]; rest: string[] } {
  const visible = containerW > 0 ? Math.ceil(containerW / PITCH) : urls.length;
  const cut = Math.min(urls.length, visible + CRITICAL_BUFFER_TILES);
  return { critical: urls.slice(0, cut), rest: urls.slice(cut) };
}

/**
 * Preloads one bounded group of thumbnails. The request priority and async
 * decoder hint prevent a background card from delaying a visible frame.
 */
export function preloadImages(
  urls: readonly string[],
  { timeoutMs = 5000, fetchPriority = 'auto' }: ImagePreloadOptions = {},
): Promise<void> {
  const unique = Array.from(new Set(urls));
  if (unique.length === 0) return Promise.resolve();

  return new Promise<void>((resolve) => {
    let remaining = unique.length;
    let settled = false;

    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve();
    };

    const timer = setTimeout(finish, timeoutMs);
    const onOneSettled = () => {
      remaining -= 1;
      if (remaining <= 0) finish();
    };

    for (const url of unique) {
      const img = new Image();
      // Decode off the render path. Browsers without `decode` still settle
      // through the native image load event.
      img.decoding = 'async';
      img.fetchPriority = fetchPriority;
      img.onload = () => {
        if (typeof img.decode !== 'function') {
          onOneSettled();
          return;
        }

        void img.decode().catch(() => undefined).then(onOneSettled);
      };
      // A broken thumbnail must never hold back the reel.
      img.onerror = onOneSettled;
      img.src = url;
    }
  });
}

/**
 * Starts background thumbnail work in bounded, sequential batches. Call this
 * only after the critical batch has started the spin and cancel it when that
 * spin is unmounted or replaced.
 */
export function scheduleImageWarmup(
  urls: readonly string[],
  {
    batchSize = WARMUP_BATCH_SIZE,
    batchDelayMs = WARMUP_BATCH_DELAY_MS,
    batchTimeoutMs = WARMUP_BATCH_TIMEOUT_MS,
  }: ImageWarmupOptions = {},
): () => void {
  const queue = Array.from(new Set(urls));
  let nextIndex = 0;
  let cancelled = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const runNextBatch = () => {
    if (cancelled || nextIndex >= queue.length) return;

    const batch = queue.slice(nextIndex, nextIndex + batchSize);
    nextIndex += batch.length;

    void preloadImages(batch, { timeoutMs: batchTimeoutMs, fetchPriority: 'low' }).then(() => {
      if (cancelled || nextIndex >= queue.length) return;
      timer = setTimeout(runNextBatch, batchDelayMs);
    });
  };

  // Give the first animated frame a paint opportunity before background work.
  timer = setTimeout(runNextBatch, batchDelayMs);

  return () => {
    cancelled = true;
    if (timer !== null) clearTimeout(timer);
  };
}
