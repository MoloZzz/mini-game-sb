import { useEffect, useRef, useState } from 'react';

import { usePrefersReducedMotion } from '@/lib/usePrefersReducedMotion';

interface AnimatedNumberProps {
  value: number;
  durationMs?: number;
  className?: string;
}

const DEFAULT_DURATION_MS = 600;

/**
 * Ease-out cubic: the tween decelerates into its landing value instead of
 * stopping dead, matching the "settle" feel used elsewhere (the reel landing).
 */
function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

/**
 * Tweens a number from its previous value to a new one and renders the
 * locale-formatted integer in between. Balances and other counters read as
 * "alive" this way instead of just flipping digits.
 */
export function AnimatedNumber({
  value,
  durationMs = DEFAULT_DURATION_MS,
  className,
}: AnimatedNumberProps) {
  const prefersReducedMotion = usePrefersReducedMotion();
  const [display, setDisplay] = useState(value);
  // Tracks the last *displayed* value (not just the last prop) so a tween
  // interrupted mid-flight by another value change resumes from where the
  // number visually is, not from a stale prop.
  const displayRef = useRef(value);
  const hasMountedRef = useRef(false);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    // A lobby that opens with the balance visibly counting up from zero
    // reads as a loading bug, not a flourish — so the first render never
    // tweens, it just shows the value.
    if (!hasMountedRef.current) {
      hasMountedRef.current = true;
      displayRef.current = value;
      setDisplay(value);
      return undefined;
    }

    const from = displayRef.current;
    const to = value;
    if (from === to) return undefined;

    const snap = () => {
      displayRef.current = to;
      setDisplay(to);
    };

    // Browsers pause requestAnimationFrame in a backgrounded tab, so a tween
    // started there would never advance and the number would sit frozen at
    // its old value — a stale balance reads as a bug. Snap instead.
    if (prefersReducedMotion || document.hidden) {
      snap();
      return undefined;
    }

    const start = performance.now();

    const tick = (now: number) => {
      const elapsed = now - start;
      const t = Math.min(1, durationMs <= 0 ? 1 : elapsed / durationMs);
      const eased = easeOutCubic(t);
      const current = Math.round(from + (to - from) * eased);
      displayRef.current = current;
      setDisplay(current);

      if (t < 1) {
        frameRef.current = requestAnimationFrame(tick);
      } else {
        frameRef.current = null;
      }
    };

    const onVisibilityChange = () => {
      if (!document.hidden) return;
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
      snap();
    };

    frameRef.current = requestAnimationFrame(tick);
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
    };
  }, [value, durationMs, prefersReducedMotion]);

  return <span className={className}>{display.toLocaleString()}</span>;
}
