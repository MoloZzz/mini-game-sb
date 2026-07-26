import { useEffect, useState } from 'react';

const QUERY = '(prefers-reduced-motion: reduce)';

type LegacyMediaQueryList = MediaQueryList & {
  addListener?: (listener: (event: MediaQueryListEvent) => void) => void;
  removeListener?: (listener: (event: MediaQueryListEvent) => void) => void;
};

function matches(): boolean {
  // jsdom does not implement matchMedia; an unguarded call crashes every test.
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia(QUERY).matches;
}

/**
 * A tiny wrapper over matchMedia rather than framer-motion's useReducedMotion
 * — this needs to be stubbable in tests, which a library-internal hook isn't.
 */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState<boolean>(matches);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined;

    const mql = window.matchMedia(QUERY) as LegacyMediaQueryList;
    const handleChange = (event: MediaQueryListEvent) => setReduced(event.matches);

    if (typeof mql.addEventListener === 'function') {
      mql.addEventListener('change', handleChange);
      return () => mql.removeEventListener('change', handleChange);
    }

    // Old Safari fallback.
    mql.addListener?.(handleChange);
    return () => mql.removeListener?.(handleChange);
  }, []);

  return reduced;
}
