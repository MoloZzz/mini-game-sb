import { useEffect, useRef, useState, type RefObject } from 'react';
import { POST_STOP_PAUSE_MS, SPIN_DURATION_MS, SPIN_EASING, type ReelTileDto } from '@card-game/shared-types';

import { usePrefersReducedMotion } from '@/lib/usePrefersReducedMotion';

import {
  CRITICAL_PRELOAD_TIMEOUT_MS,
  preloadImages,
  scheduleImageWarmup,
  splitReelThumbs,
} from './preloadImages';
import { randomJitter, targetOffset } from './reelMath';

export type ReelPhase = 'idle' | 'preloading' | 'spinning' | 'landing' | 'done';

/** A discriminated hint so the component can pick between an animated and an instant transform. */
export type SpinAnimateHint =
  | { type: 'instant' }
  | { type: 'animated'; durationMs: number; easing: readonly [number, number, number, number] };

export interface ReelSpinDebug {
  containerW: number;
  jitter: number;
  target: number;
}

interface UseReelSpinArgs {
  reel: ReelTileDto[] | null;
  spinId: string | null;
  containerRef: RefObject<HTMLElement | null>;
  onLanded: () => void;
  /** Overrides the OS `prefers-reduced-motion` read, so the sandbox can exercise the skip path on demand. */
  forceReducedMotion?: boolean;
}

interface UseReelSpinResult {
  phase: ReelPhase;
  targetX: number;
  animate: SpinAnimateHint;
  /** The frozen geometry for this cycle, once known — for debug readouts. */
  debug: ReelSpinDebug | null;
  /** Call when the caller's own animation (e.g. Framer Motion) reports completion. */
  onAnimationComplete: () => void;
}

export function useReelSpin({
  reel,
  spinId,
  containerRef,
  onLanded,
  forceReducedMotion,
}: UseReelSpinArgs): UseReelSpinResult {
  const [phase, setPhaseState] = useState<ReelPhase>('idle');
  const [targetX, setTargetX] = useState(0);
  const [animate, setAnimate] = useState<SpinAnimateHint>({ type: 'instant' });
  const [debug, setDebug] = useState<ReelSpinDebug | null>(null);

  // Mirrors `phase` synchronously so callbacks (timeouts, visibilitychange,
  // the caller's onAnimationComplete) can branch on the current phase without
  // waiting on a React re-render.
  const phaseRef = useRef<ReelPhase>('idle');
  const setPhase = (next: ReelPhase) => {
    phaseRef.current = next;
    setPhaseState(next);
  };

  const prefersReducedMotionOS = usePrefersReducedMotion();
  const reducedMotionRef = useRef(false);
  reducedMotionRef.current = forceReducedMotion ?? prefersReducedMotionOS;

  const onLandedRef = useRef(onLanded);
  onLandedRef.current = onLanded;

  const spinIdRef = useRef<string | null>(null);
  const landingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Populated inside the effect below so the external onAnimationComplete
  // (fired by the caller's animation library) and the internal skip/backgrounded
  // paths share one timer-scheduling implementation instead of duplicating it.
  const scheduleLandingRef = useRef<() => void>(() => {});

  useEffect(() => {
    if (spinId === null || reel === null) return undefined;
    spinIdRef.current = spinId;

    let cancelled = false;
    const isCurrent = () => !cancelled && spinIdRef.current === spinId;

    setPhase('preloading');
    setAnimate({ type: 'instant' });
    setDebug(null);
    // Every new spinId restarts the strip from tile 0 flush with the left
    // edge — without this reset, a repeat opening would animate from wherever
    // the previous spin stopped, not from x = 0 as the spec requires.
    setTargetX(0);

    // Freeze the container width now. Ignoring every resize for the rest of
    // the cycle is deliberate — recomputing mid-flight breaks the landing.
    const containerW = containerRef.current?.getBoundingClientRect().width ?? 0;
    const jitter = randomJitter();
    const target = targetOffset(containerW, jitter);

    const scheduleLanding = () => {
      if (!isCurrent()) return;
      setPhase('landing');
      // The silence here is the "it landed" beat — without it the reveal
      // swallows the moment of the stop.
      landingTimerRef.current = setTimeout(() => {
        if (!isCurrent()) return;
        setPhase('done');
        onLandedRef.current();
      }, POST_STOP_PAUSE_MS);
    };
    scheduleLandingRef.current = scheduleLanding;

    function onVisibilityChange() {
      if (document.hidden && phaseRef.current === 'spinning' && isCurrent()) {
        setTargetX(target);
        setAnimate({ type: 'instant' });
        document.removeEventListener('visibilitychange', onVisibilityChange);
        scheduleLanding();
      }
    }

    // Only the first screenful gates the start. The rest of the strip is at
    // least a second of scrolling away, so it loads alongside the animation
    // instead of holding a spinner over a reel that is ready to move.
    const { critical, rest } = splitReelThumbs(
      reel.map((tile) => tile.thumbUrl),
      containerW,
    );
    const criticalUrls = new Set(critical);
    const warmupUrls = rest.filter((url) => !criticalUrls.has(url));
    let cancelWarmup = () => {};

    preloadImages(critical, {
      timeoutMs: CRITICAL_PRELOAD_TIMEOUT_MS,
      fetchPriority: 'high',
    }).then(() => {
      if (!isCurrent()) return;

      setTargetX(target);
      setDebug({ containerW, jitter, target });

      // Five seconds of fast horizontal scrolling can trigger nausea or a
      // migraine for reduced-motion users; a backgrounded tab can't render
      // the animation anyway, so both skip straight to the landing beat.
      const skip = reducedMotionRef.current || document.hidden;
      if (skip) {
        setAnimate({ type: 'instant' });
        scheduleLanding();
        return;
      }

      setAnimate({ type: 'animated', durationMs: SPIN_DURATION_MS, easing: SPIN_EASING });
      setPhase('spinning');
      document.addEventListener('visibilitychange', onVisibilityChange);

      // The rest must not compete with the first spin frame. It is warmed in
      // small batches while the marker is still far from those tiles.
      cancelWarmup = scheduleImageWarmup(warmupUrls);
    });

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibilityChange);
      if (landingTimerRef.current !== null) {
        clearTimeout(landingTimerRef.current);
        landingTimerRef.current = null;
      }
      cancelWarmup();
    };
    // containerRef/onLanded/reducedMotion are read through refs on purpose —
    // only a genuinely new spinId (with its reel) should restart this cycle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spinId, reel]);

  const onAnimationComplete = () => {
    if (phaseRef.current !== 'spinning') return;
    scheduleLandingRef.current();
  };

  return { phase, targetX, animate, debug, onAnimationComplete };
}
