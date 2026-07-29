import { RARITY_META, type Rarity } from '@card-game/shared-types';

/**
 * Every rarity-tinted surface in the app used to hardcode its own alpha suffix
 * (`${color}1a`, `22`, `33`, `66`, `99`, `14`) picked by eye, which is why the
 * same "art window background" ended up slightly different on three screens.
 * The tint levels are named by what they are FOR, so a new surface picks a
 * role instead of inventing a hex pair.
 */
export type RarityTintLevel =
  /** Art-window backdrop behind a loaded image — barely there. */
  | 'surface'
  /** Locked/undiscovered slot fill — fainter than `surface`. */
  | 'ghost'
  /** Name plate and rarity pill background. */
  | 'plate'
  /** Broken-image fallback block, which must read as deliberate, not empty. */
  | 'fallback'
  /** Dashed or de-emphasised border. */
  | 'outlineSoft'
  /** Foreground text/glyph on a `ghost` surface. */
  | 'muted';

const ALPHA_BY_LEVEL: Readonly<Record<RarityTintLevel, string>> = {
  surface: '1a',
  ghost: '14',
  plate: '22',
  fallback: '33',
  outlineSoft: '66',
  muted: '99',
};

/** Opaque rarity colour — the single source is `RARITY_META`, never a local copy. */
export function rarityColor(rarity: Rarity): string {
  return RARITY_META[rarity].color;
}

/** Rarity colour at a named alpha level. See `RarityTintLevel`. */
export function rarityTint(rarity: Rarity, level: RarityTintLevel): string {
  return `${RARITY_META[rarity].color}${ALPHA_BY_LEVEL[level]}`;
}

export type RarityGlowSize = 'none' | 'frame' | 'detail' | 'zoom';

/**
 * Glow radius (px) scales with rarity so the frame alone signals importance,
 * before the player reads a single word — common gets none, mythic gets a lot.
 * Previously this lived only in `CardFrame`, so the inventory and collection
 * detail views (which drew their own frame) got a flat glow for every rarity.
 */
const GLOW_BLUR_BY_RARITY: Readonly<Record<Rarity, number>> = {
  common: 0,
  uncommon: 8,
  rare: 14,
  epic: 20,
  legendary: 30,
  mythic: 44,
};

/** Multiplies the rarity blur — a zoomed card carries the same relative glow at a larger scale. */
const GLOW_SCALE_BY_SIZE: Readonly<Record<RarityGlowSize, number>> = {
  none: 0,
  frame: 1,
  detail: 1.15,
  zoom: 1.6,
};

/** `boxShadow` value, or `undefined` when this rarity/size earns no glow. */
export function rarityGlow(rarity: Rarity, size: RarityGlowSize = 'frame'): string | undefined {
  const blur = Math.round(GLOW_BLUR_BY_RARITY[rarity] * GLOW_SCALE_BY_SIZE[size]);
  if (blur <= 0) return undefined;
  return `0 0 ${blur}px ${Math.round(blur / 3)}px ${rarityTint(rarity, 'outlineSoft')}`;
}

/**
 * Up to two initials, used by every broken-image fallback (reel tiles, grid
 * tiles, card previews). Six copies of this function existed before; a card
 * named "Storm Falcon" must abbreviate identically everywhere it appears.
 */
export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? '')
    .join('');
}
