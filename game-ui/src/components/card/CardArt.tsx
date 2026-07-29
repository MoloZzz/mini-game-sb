import type { CSSProperties } from 'react';
import type { CardDto } from '@card-game/shared-types';

import { ImgWithFallback } from '@/components/ui/ImgWithFallback';
import { initials, rarityColor, rarityTint } from '@/lib/rarityStyle';

export interface CardArtProps {
  card: Pick<CardDto, 'name' | 'rarity' | 'imageUrl' | 'thumbUrl'>;
  /** Grids and reels use the thumb; previews and zoom use the full art. */
  source?: 'art' | 'thumb';
  /** Decorative art (the name is already adjacent in the DOM) gets `alt=""`. */
  decorative?: boolean;
  /** Font size for the initials fallback — px, so it can scale with the frame. */
  initialsFontSize?: number | string;
  className?: string;
  style?: CSSProperties;
  loading?: 'lazy' | 'eager';
}

/**
 * The square art window, with its rarity-tinted broken-image fallback. Eight
 * components used to carry their own `useState(broken)` + `onError` pair and
 * their own copy of `initials()`, which is why a missing thumb looked
 * different in the reel, the grid and the detail view.
 */
export function CardArt({
  card,
  source = 'art',
  decorative = false,
  initialsFontSize,
  className,
  style,
  loading = 'lazy',
}: CardArtProps) {
  return (
    <ImgWithFallback
      src={source === 'thumb' ? card.thumbUrl : card.imageUrl}
      alt={decorative ? '' : card.name}
      loading={loading}
      className={`flex items-center justify-center object-cover font-bold ${className ?? ''}`}
      style={{ color: rarityColor(card.rarity), ...style }}
      fallbackColor={rarityTint(card.rarity, 'fallback')}
      fallbackContent={<span style={{ fontSize: initialsFontSize }}>{initials(card.name)}</span>}
    />
  );
}
