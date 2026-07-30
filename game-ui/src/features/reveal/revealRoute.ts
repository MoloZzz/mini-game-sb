type RevealModule = { default: typeof import('./Reveal').Reveal };

let revealPromise: Promise<RevealModule> | null = null;

/**
 * Reveal includes the visual FX stack, so it deliberately stays out of the
 * opening route's initial chunk. The same promise is used for a spin-time
 * preload and React.lazy at the landing transition.
 */
export function loadReveal(): Promise<RevealModule> {
  revealPromise ??= import('./Reveal').then(({ Reveal }) => ({ default: Reveal }));
  return revealPromise;
}

/** Start the nested chunk while the reel owns the screen. */
export function preloadReveal(): void {
  // Speculative loading should never generate an unhandled rejection. A real
  // render will still surface chunk-load errors through React's normal path.
  void loadReveal().catch(() => {});
}
