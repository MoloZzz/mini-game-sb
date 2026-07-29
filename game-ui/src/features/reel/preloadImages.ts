import { PITCH } from '@card-game/shared-types';

/**
 * How long the spin may be held back waiting for the first screenful of
 * thumbs. Beyond this the stall reads as a broken button, which is worse
 * than a tile or two fading in — so we start regardless.
 */
export const CRITICAL_PRELOAD_TIMEOUT_MS = 400;

/** A couple of tiles past the right edge, so the first frames of scroll are covered. */
const CRITICAL_BUFFER_TILES = 2;

/**
 * Splits the strip into what must be on screen *now* and what the spin has
 * seconds to fetch.
 *
 * Waiting on all 60 thumbs before starting is what made the reel sit under a
 * spinner for half a second on every open. Only the tiles visible at x = 0 are
 * actually urgent; everything past the right edge is at least a second of
 * scrolling away and loads comfortably in the background.
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
 * Preloads a batch of image URLs, resolving once every one has settled
 * (loaded or failed) or the timeout elapses — whichever comes first.
 *
 * Runs between the API response and the animation start. Skipping this and
 * starting the spin immediately means half the tiles render blank and pop in
 * one by one during the scroll — the worst possible look for this component.
 */
export function preloadImages(urls: readonly string[], timeoutMs = 5000): Promise<void> {
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

    // Safety net: a stalled request must not wedge the UI. Cleared on
    // success above so it never fires after the batch already resolved.
    const timer = setTimeout(finish, timeoutMs);

    const onOneSettled = () => {
      remaining -= 1;
      if (remaining <= 0) finish();
    };

    for (const url of unique) {
      const img = new Image();
      // onerror MUST also resolve its slot — one broken thumb otherwise
      // hangs the entire game.
      img.onload = onOneSettled;
      img.onerror = onOneSettled;
      img.src = url;
    }
  });
}
