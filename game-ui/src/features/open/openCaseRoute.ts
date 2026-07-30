type OpenCaseScreenModule = { default: typeof import('./OpenCaseScreen').OpenCaseScreen };

let openCaseScreenPromise: Promise<OpenCaseScreenModule> | null = null;

/**
 * Shares the route import between intent prefetches and React.lazy. This keeps
 * a pointer/focus hint from starting a second network request when navigation
 * follows immediately afterwards.
 */
export function loadOpenCaseScreen(): Promise<OpenCaseScreenModule> {
  openCaseScreenPromise ??= import('./OpenCaseScreen').then(({ OpenCaseScreen }) => ({
    default: OpenCaseScreen,
  }));
  return openCaseScreenPromise;
}

/** Download (but never execute) the opening route ahead of a likely open. */
export function preloadOpenCaseScreen(): void {
  // A failed speculative request must not surface as an unhandled rejection.
  // React.lazy will still report a real chunk-load failure if the user later
  // navigates to the route.
  void loadOpenCaseScreen().catch(() => {});
}
