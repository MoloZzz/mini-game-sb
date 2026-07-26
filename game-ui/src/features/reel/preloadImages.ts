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
