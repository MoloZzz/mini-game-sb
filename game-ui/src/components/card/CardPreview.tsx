import type { CardDto } from '@card-game/shared-types';

import { rarityColor, rarityGlow, rarityTint } from '@/lib/rarityStyle';

import { CardArt } from './CardArt';

export type CardPreviewSize = 'sm' | 'md' | 'lg' | 'xl';

export interface CardPreviewProps {
  card: CardDto;
  size?: CardPreviewSize;
  showStats?: boolean;
  showFlavor?: boolean;
  showMeta?: boolean;
  /** When set, the art window becomes a zoom trigger. */
  onArtClick?: () => void;
  className?: string;
}

/**
 * ONE width scale for every card frame in the app. The inventory detail hard-coded
 * 220px and its zoom 480px; the collection detail copied the frame but zoomed to
 * 560px — which is why the same card looked bigger in the dex than in the bag.
 * A screen now picks a size name, and there is nowhere left to type a raw pixel width.
 */
const WIDTH_BY_SIZE: Readonly<Record<CardPreviewSize, number>> = {
  sm: 180,
  md: 260,
  lg: 340,
  xl: 480,
};

/** Every named frame scale still needs room for its surrounding page or modal padding. */
const MAX_WIDTH_BY_SIZE: Readonly<Record<CardPreviewSize, string>> = {
  sm: 'min(100%, calc(100vw - 3rem))',
  md: 'min(100%, calc(100vw - 3rem))',
  lg: 'min(100%, calc(100vw - 3rem))',
  xl: 'min(90vw, 100%, calc(100vw - 3rem))',
};

const GLOW_BY_SIZE = { sm: 'frame', md: 'detail', lg: 'frame', xl: 'zoom' } as const;

/**
 * ADR-005: Stable Diffusion cannot render legible text (a CLIP-encoder
 * limitation, not a prompt problem) — so the model draws only the square art
 * window. Everything else here — frame, name, stats, flavour text — is DOM
 * and CSS. Re-skinning the frame, renaming a card, or reassigning its rarity
 * never touches the image file. This is how Hearthstone and MTG are built.
 */
export function CardPreview({
  card,
  size = 'md',
  showStats = true,
  showFlavor = true,
  showMeta = false,
  onArtClick,
  className,
}: CardPreviewProps) {
  const width = WIDTH_BY_SIZE[size];
  const metaLine = [card.element, card.archetype].filter(Boolean).join(' · ');
  const scale = size === 'xl' ? 1.4 : 1;

  const art = (
    <CardArt
      card={card}
      source="art"
      initialsFontSize={width / 6}
      className="h-full w-full"
      style={{ backgroundColor: rarityTint(card.rarity, 'surface') }}
    />
  );

  return (
    <div
      className={`flex max-w-full flex-col overflow-hidden rounded-lg border-[3px] bg-neutral-900 ${className ?? ''}`}
      style={{
        width,
        maxWidth: MAX_WIDTH_BY_SIZE[size],
        borderColor: rarityColor(card.rarity),
        boxShadow: rarityGlow(card.rarity, GLOW_BY_SIZE[size]),
      }}
    >
      {/* Name plate */}
      <div
        className={`truncate px-2 text-center font-bold text-neutral-100 ${
          scale > 1 ? 'py-2 text-base' : 'py-1.5 text-sm'
        }`}
        style={{ backgroundColor: rarityTint(card.rarity, 'plate') }}
      >
        {card.name}
      </div>

      {/* Art window — the ONLY <img> in this component. Everything around it is markup. */}
      {onArtClick ? (
        <button
          type="button"
          onClick={onArtClick}
          aria-label="View full size"
          className="group relative block w-full cursor-zoom-in"
          style={{ aspectRatio: '1 / 1' }}
        >
          {art}
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition-opacity group-hover:bg-black/30 group-hover:opacity-100">
            <span className="rounded-full bg-neutral-950/80 px-2 py-1 text-xs font-semibold text-neutral-100">
              Click to enlarge
            </span>
          </span>
        </button>
      ) : (
        <div className="relative w-full" style={{ aspectRatio: '1 / 1' }}>
          {art}
        </div>
      )}

      {showStats && (
        <div
          className={`flex items-center justify-between font-semibold text-neutral-200 ${
            scale > 1 ? 'px-4 py-2 text-base' : 'px-3 py-1.5 text-sm'
          }`}
        >
          <span>ATK {card.attack}</span>
          <span>DEF {card.defense}</span>
        </div>
      )}

      {showFlavor && card.flavorText && (
        <p
          className={`text-center italic text-neutral-400 ${
            scale > 1 ? 'px-4 pb-3 text-sm' : 'px-3 pb-1.5 text-xs'
          }`}
        >
          {card.flavorText}
        </p>
      )}

      {showMeta && metaLine && (
        <p className="truncate px-3 pb-2 text-center text-[11px] uppercase tracking-wide text-neutral-500">
          {metaLine}
        </p>
      )}
    </div>
  );
}

/** Exposed so tests can assert that one `size` means one width everywhere. */
export const CARD_PREVIEW_WIDTHS = WIDTH_BY_SIZE;
