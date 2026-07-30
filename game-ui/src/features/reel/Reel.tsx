import { useEffect, useMemo, useRef } from 'react';
import { TILE_GAP, type ReelTileDto } from '@card-game/shared-types';

import { ReelTile } from './ReelTile';
import { useReelSpin, type ReelPhase, type ReelSpinDebug } from './useReelSpin';

const VIEWPORT_HEIGHT = 176;
const EDGE_FADE_PX = 80;

export interface ReelDebugInfo extends Partial<ReelSpinDebug> {
  phase: ReelPhase;
}

interface ReelProps {
  reel: ReelTileDto[] | null;
  spinId: string | null;
  onLanded: () => void;
  className?: string;
  /** Forces the reduced-motion (skip) path without touching OS settings — for the sandbox's debug checkbox. */
  forceReducedMotion?: boolean;
  /** Fires whenever phase or the frozen geometry changes — feeds the sandbox's tuning readout. */
  onDebug?: (info: ReelDebugInfo) => void;
}

const edgeFadeMask = `linear-gradient(to right, transparent 0, black ${EDGE_FADE_PX}px, black calc(100% - ${EDGE_FADE_PX}px), transparent 100%)`;

export function Reel({ reel, spinId, onLanded, className, forceReducedMotion, onDebug }: ReelProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const { phase, targetX, animate, debug, onAnimationComplete } = useReelSpin({
    reel,
    spinId,
    containerRef,
    onLanded,
    forceReducedMotion,
  });

  useEffect(() => {
    onDebug?.({ phase, ...debug });
    // onDebug is expected to be stable-ish from the caller; re-running when
    // it isn't just re-reports the same values, which is harmless.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, debug]);

  const stripTransition = useMemo(() => {
    if (animate.type !== 'animated') return 'none';
    return `transform ${animate.durationMs}ms cubic-bezier(${animate.easing.join(', ')})`;
  }, [animate]);

  return (
    <div
      ref={containerRef}
      className={`relative w-full overflow-hidden bg-neutral-900/60 ${reel ? '' : 'opacity-40'} ${className ?? ''}`}
      style={{
        height: VIEWPORT_HEIGHT,
        maskImage: edgeFadeMask,
        WebkitMaskImage: edgeFadeMask,
      }}
    >
      {reel && (
        // ONE transform, on the strip container — never animate 60 tiles
        // individually, that's 60 composite layers and guaranteed jank.
        <div
          data-testid="reel-strip"
          style={{
            display: 'flex',
            gap: TILE_GAP,
            willChange: 'transform',
            transform: `translate3d(${targetX}px, 0, 0)`,
            transition: stripTransition,
          }}
          onTransitionEnd={(event) => {
            if (event.target === event.currentTarget && event.propertyName === 'transform') {
              onAnimationComplete();
            }
          }}
        >
          {reel.map((tile, index) => (
            <ReelTile key={`${index}-${tile.id}`} tile={tile} index={index} />
          ))}
        </div>
      )}

      <Marker />

      {phase === 'preloading' && <Spinner />}
    </div>
  );
}

function Marker() {
  return (
    // Centering transform comes from the Tailwind utility (a stylesheet
    // rule), not an inline style — the strip's animated `transform` should
    // be the only inline transform in the tree.
    <div className="pointer-events-none absolute inset-y-0 left-1/2 -translate-x-1/2">
      <div className="absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 bg-amber-400" />
      <div
        className="absolute -top-1 left-1/2 h-0 w-0 -translate-x-1/2 border-x-[6px] border-t-[8px] border-x-transparent border-t-amber-400"
      />
      <div
        className="absolute -bottom-1 left-1/2 h-0 w-0 -translate-x-1/2 border-x-[6px] border-b-[8px] border-x-transparent border-b-amber-400"
      />
    </div>
  );
}

function Spinner() {
  return (
    // Fades in only if the wait is long enough to notice. A cached strip is
    // ready in well under 200ms, and a loader that flashes for two frames
    // reads as a stutter rather than as progress.
    <div
      className="absolute inset-0 flex animate-[fadeIn_150ms_ease-out_200ms_both] items-center justify-center bg-neutral-950/70"
    >
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-neutral-600 border-t-amber-400" />
    </div>
  );
}
