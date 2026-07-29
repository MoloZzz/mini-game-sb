import { useState, type CSSProperties, type ReactNode } from 'react';

export interface ImgWithFallbackProps {
  src: string;
  /** Empty string marks the image as decorative — the fallback block is hidden from AT too. */
  alt: string;
  className?: string;
  title?: string;
  /** Tint for the fallback block — usually the card/case's rarity colour with alpha. */
  fallbackColor?: string;
  /** Drawn inside the fallback block — card initials, for instance. */
  fallbackContent?: ReactNode;
  /** Merged onto whichever element renders — the real <img> or its fallback block. */
  style?: CSSProperties;
  /** The reel loads its strip eagerly; grids and panels stay lazy. */
  loading?: 'lazy' | 'eager';
}

const DEFAULT_FALLBACK_COLOR = '#404040';

/**
 * Card and case art is placeholder SVG for now and can 404 outright. A broken
 * `<img>` must never blank a tile, so failures fall back to a tinted block of
 * the same size and the layout never jumps.
 *
 * Callers that swap `src` without unmounting (a detail panel whose focused
 * card changes in place) should pass a `key` tied to the card id, so the
 * broken flag resets for the new image.
 *
 * This merges two divergent copies that lived in `features/lobby/` and
 * `features/admin/` — the union of their props, with the lobby version's
 * decorative-image ARIA handling, which was the more correct of the two.
 */
export function ImgWithFallback({
  src,
  alt,
  className,
  title,
  fallbackColor,
  fallbackContent,
  style,
  loading = 'lazy',
}: ImgWithFallbackProps) {
  const [broken, setBroken] = useState(false);

  if (broken) {
    return (
      <div
        className={className}
        title={title}
        role={alt ? 'img' : undefined}
        aria-label={alt || undefined}
        aria-hidden={alt ? undefined : true}
        style={{ backgroundColor: fallbackColor ?? DEFAULT_FALLBACK_COLOR, ...style }}
      >
        {fallbackContent}
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      title={title}
      draggable={false}
      loading={loading}
      className={className}
      style={style}
      onError={() => setBroken(true)}
    />
  );
}
