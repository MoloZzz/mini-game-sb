import { useEffect, useMemo, useRef } from 'react';
import { motion } from 'framer-motion';
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

  const transition = useMemo(() => {
    return animate.type === 'animated'
      ? { duration: animate.durationMs / 1000, ease: animate.easing }
      : { duration: 0 };
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
        <motion.div
          data-testid="reel-strip"
          style={{ display: 'flex', gap: TILE_GAP, willChange: 'transform' }}
          initial={{ x: 0 }}
          animate={{ x: targetX }}
          transition={transition}
          onAnimationComplete={onAnimationComplete}
        >
          {reel.map((tile, index) => (
            <ReelTile key={`${index}-${tile.id}`} tile={tile} index={index} />
          ))}
        </motion.div>
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
    <div className="absolute inset-0 flex items-center justify-center bg-neutral-950/70">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-neutral-600 border-t-amber-400" />
    </div>
  );
}
