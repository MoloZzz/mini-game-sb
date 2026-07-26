import { useState, type CSSProperties } from 'react';

interface ImgWithFallbackProps {
  src: string;
  alt: string;
  /** Rarity colour (with alpha already applied by the caller) for the placeholder block. */
  fallbackColor: string;
  className?: string;
  /** Merged onto both the <img> and its fallback block — e.g. a rarity-coloured border. */
  style?: CSSProperties;
}

/**
 * No generated art exists this session — every `imageUrl`/`thumbUrl` points at
 * a placeholder SVG, and even those can 404 on a bad path. A broken `<img>`
 * must never blank out a grid tile or the detail panel, so failures fall
 * back to a rarity-tinted block instead of a browser broken-image icon.
 *
 * Callers that swap `src` without unmounting (e.g. the detail panel, whose
 * focused card changes without the component remounting) should pass a `key`
 * tied to the card id so the "broken" flag resets for the new image.
 */
export function ImgWithFallback({ src, alt, fallbackColor, className, style }: ImgWithFallbackProps) {
  const [broken, setBroken] = useState(false);

  if (broken) {
    return (
      <div
        role="img"
        aria-label={alt}
        className={className}
        style={{ ...style, backgroundColor: fallbackColor }}
      />
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      onError={() => setBroken(true)}
      className={className}
      style={style}
    />
  );
}
