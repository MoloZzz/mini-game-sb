import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { RARITY_META, type OpenCaseResponse } from '@card-game/shared-types';

import { Button } from '@/components/Button';
import { CardPreview } from '@/components/card/CardPreview';
import { RarityBadge } from '@/components/RarityBadge';
import { RARITY_FX } from '@/lib/rarityFx';
import { usePrefersReducedMotion } from '@/lib/usePrefersReducedMotion';

import { RarityFxLayer } from './RarityFxLayer';

export interface RevealProps {
  result: OpenCaseResponse;
  onAgain: () => void;
  onToInventory: () => void;
  caseName?: string;
  againDisabled?: boolean;
  expeditionComplete?: boolean;
  expeditionCollectionLabel?: string;
  onToExpeditionCollection?: () => void;
}

/** Buttons appear once the card is fully readable — see the roulette spec's timeline. */
const BUTTONS_BASE_DELAY_S = 0.8;

/**
 * The payoff screen. Timeline (roulette spec "Тайм-лайн", the reel has already
 * paused 300ms before this mounts):
 *  - 0ms: the card scales up out of the strip's centre, rarity FX fire at the same time.
 *  - ~500ms: the card is fully readable at `lg` size.
 *  - ~800ms: the buttons appear, "Again" pre-focused.
 */
export function Reveal({
  result,
  onAgain,
  onToInventory,
  caseName,
  againDisabled,
  expeditionComplete = false,
  expeditionCollectionLabel,
  onToExpeditionCollection,
}: RevealProps) {
  const { wonCard, isDuplicate, copies, balance } = result;
  const reducedMotion = usePrefersReducedMotion();
  const fx = RARITY_FX[wonCard.rarity];
  const color = RARITY_META[wonCard.rarity].color;

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onToInventory();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onToInventory]);

  // Shake lives here, not in RarityFxLayer: that layer has no children to wrap,
  // so the wrapper that actually needs to move is the card itself.
  const shakeAnimate =
    !reducedMotion && fx.shakeIntensityPx > 0
      ? {
          x: [0, -fx.shakeIntensityPx, fx.shakeIntensityPx, -fx.shakeIntensityPx * 0.5, 0],
          y: [0, fx.shakeIntensityPx * 0.3, -fx.shakeIntensityPx * 0.3, 0],
        }
      : { x: 0, y: 0 };

  // Mythic's uiFreezeMs (~1s) stacks on top of the baseline button delay — the
  // "full UI stop" from the FX table, not just a comment on the type. Every
  // other rarity has uiFreezeMs === 0 and falls back to the plain baseline.
  const buttonsDelayS = reducedMotion ? 0 : BUTTONS_BASE_DELAY_S + fx.uiFreezeMs / 1000;

  return (
    // Keyed by dropId at the call site's discretion too, but keying the whole
    // subtree here guarantees every field (focus, particles, shake) resets per drop.
    <div
      key={result.dropId}
      className="flex min-h-screen flex-col items-center justify-center gap-5 bg-neutral-950 px-6 py-10 text-neutral-100"
    >
      {caseName && <p className="text-sm text-neutral-500">{caseName}</p>}

      <div className="relative flex items-center justify-center">
        <RarityFxLayer rarity={wonCard.rarity} active />

        <motion.div
          className="relative"
          initial={reducedMotion ? { scale: 1, opacity: 1, rotate: 0 } : { scale: 0.35, opacity: 0, rotate: -8 }}
          animate={{ scale: 1, opacity: 1, rotate: 0, x: shakeAnimate.x, y: shakeAnimate.y }}
          transition={{
            scale: { duration: 0.5, ease: 'easeOut' },
            opacity: { duration: 0.4 },
            rotate: { duration: 0.5, ease: 'easeOut' },
            x: { duration: fx.shakeDurationMs / 1000, delay: 0.15 },
            y: { duration: fx.shakeDurationMs / 1000, delay: 0.15 },
          }}
        >
          <CardPreview card={wonCard} size="lg" showMeta />

          <div className="absolute -right-2 -top-2">
            {isDuplicate ? (
              <span className="rounded-full border border-neutral-600 bg-neutral-900 px-3 py-1 text-xs font-bold text-neutral-200">
                ×{copies}
              </span>
            ) : (
              <span className="rounded-full bg-amber-400 px-3 py-1 text-xs font-bold text-neutral-950">NEW</span>
            )}
          </div>
        </motion.div>
      </div>

      <RarityBadge rarity={wonCard.rarity} />

      {isDuplicate && (
        <p className="text-sm text-neutral-400">
          Duplicate — worth{' '}
          <span className="font-semibold" style={{ color }}>
            {RARITY_META[wonCard.rarity].sellValue} coins
          </span>{' '}
          when sold
        </p>
      )}

      <p className="text-sm text-neutral-400">
        Balance: <span className="font-semibold text-neutral-200">{balance.coins} coins</span>,{' '}
        <span className="font-semibold text-neutral-200">{balance.keys} keys</span>
      </p>

      {expeditionComplete && (
        <div className="rounded-lg border border-emerald-400/40 bg-emerald-400/10 px-4 py-3 text-center">
          <p className="text-sm font-semibold text-emerald-300">Expedition complete</p>
          <p className="mt-1 text-xs text-neutral-400">This session direction ends here; it grants no extra reward.</p>
          {onToExpeditionCollection && expeditionCollectionLabel && (
            <button type="button" onClick={onToExpeditionCollection} className="mt-3 text-sm font-semibold text-amber-300 underline underline-offset-4">
              {expeditionCollectionLabel}
            </button>
          )}
        </div>
      )}

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: buttonsDelayS, duration: 0.3 }}
        className="flex flex-col items-center gap-3"
      >
        {/* "Again" is the whole reason the genre exists: largest, centred, autofocused. */}
        <Button variant="primary" size="lg" autoFocus onClick={onAgain} disabled={againDisabled}>
          Again
        </Button>
        <Button variant="secondary" size="sm" onClick={onToInventory}>
          To inventory
        </Button>
      </motion.div>
    </div>
  );
}
