import { useState, type CSSProperties } from 'react';

interface ImgWithFallbackProps {
  src: string;
  alt: string;
  className?: string;
  title?: string;
  /** Tint for the fallback block — usually the card/case's rarity colour. */
  fallbackColor?: string;
  /** Extra inline styles (e.g. a themed border colour) merged onto whichever
   * element actually renders — the real `<img>` or its fallback block. */
  style?: CSSProperties;
}

/**
 * There is no generated art this session (case/card images are placeholder
 * SVGs) and there will be none for a while after — a missing or 404ing image
 * must never blank out a tile. `onError` swaps to a tinted block sized like
 * the image would have been, so the layout never jumps and the screen stays
 * demoable with or without real art.
 */
export function ImgWithFallback({ src, alt, className, title, fallbackColor, style }: ImgWithFallbackProps) {
  const [broken, setBroken] = useState(false);

  if (broken) {
    return (
      <div
        className={className}
        title={title}
        role={alt ? 'img' : undefined}
        aria-label={alt || undefined}
        aria-hidden={alt ? undefined : true}
        style={{ backgroundColor: fallbackColor ?? '#404040', ...style }}
      />
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      title={title}
      draggable={false}
      className={className}
      style={style}
      onError={() => setBroken(true)}
    />
  );
}
