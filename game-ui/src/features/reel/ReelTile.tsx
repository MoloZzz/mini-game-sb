import { memo } from 'react';
import { TILE_W, type ReelTileDto } from '@card-game/shared-types';

import { ImgWithFallback } from '@/components/ui/ImgWithFallback';
import { initials, rarityColor, rarityTint } from '@/lib/rarityStyle';

interface ReelTileProps {
  tile: ReelTileDto;
  index: number;
}

/** 140px square art window + 36px name strip. */
const TILE_HEIGHT = 176;
const NAME_STRIP_HEIGHT = 36;

/**
 * Enough for a desktop viewport and several moving frames. The actual
 * critical subset is calculated from the measured reel width in useReelSpin;
 * this browser hint prevents all 60 mounted <img> nodes from competing with
 * that subset before it resolves.
 */
export const EAGER_REEL_TILE_COUNT = 12;

export function reelTileImagePriority(index: number): {
  loading: 'lazy' | 'eager';
  fetchPriority: 'high' | 'low';
} {
  return index < EAGER_REEL_TILE_COUNT
    ? { loading: 'eager', fetchPriority: 'high' }
    : { loading: 'lazy', fetchPriority: 'low' };
}

function ReelTileImpl({ tile, index }: ReelTileProps) {
  const color = rarityColor(tile.rarity);
  const imagePriority = reelTileImagePriority(index);

  return (
    <div
      data-reel-index={index}
      data-card-id={tile.id}
      className="flex flex-col overflow-hidden rounded-md border-2 bg-neutral-900"
      style={{
        flex: `0 0 ${TILE_W}px`,
        width: TILE_W,
        height: TILE_HEIGHT,
        // Each tile is its own layout/paint boundary — 60 of these never
        // force a shared reflow while the strip's single transform animates.
        contain: 'layout paint',
        borderColor: color,
      }}
    >
      <div
        className="flex items-center justify-center"
        style={{ width: TILE_W, height: TILE_W, backgroundColor: rarityTint(tile.rarity, 'surface') }}
      >
        {/* A broken thumb must never block the animation — `ImgWithFallback`
            swaps to a rarity-tinted initials block instead of a missing-image icon. */}
        <ImgWithFallback
          src={tile.thumbUrl}
          alt=""
          {...imagePriority}
          decoding="async"
          className="flex h-full w-full items-center justify-center object-cover text-2xl font-bold"
          style={{ color }}
          fallbackColor={rarityTint(tile.rarity, 'fallback')}
          fallbackContent={initials(tile.name)}
        />
      </div>
      <div
        className="flex items-center justify-center px-1"
        style={{ height: NAME_STRIP_HEIGHT }}
      >
        <span className="w-full truncate text-center text-xs text-neutral-200">{tile.name}</span>
      </div>
    </div>
  );
}

export const ReelTile = memo(ReelTileImpl);
