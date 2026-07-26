import { memo, useState } from 'react';
import { RARITY_META, TILE_W, type ReelTileDto } from '@card-game/shared-types';

interface ReelTileProps {
  tile: ReelTileDto;
  index: number;
}

/** 140px square art window + 36px name strip. */
const TILE_HEIGHT = 176;
const NAME_STRIP_HEIGHT = 36;

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? '')
    .join('');
}

function ReelTileImpl({ tile, index }: ReelTileProps) {
  // A broken thumb must never block the animation — swap to a rarity-tinted
  // placeholder instead of leaving a missing-image icon in the strip.
  const [broken, setBroken] = useState(false);
  const color = RARITY_META[tile.rarity].color;

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
        style={{ width: TILE_W, height: TILE_W, backgroundColor: `${color}1a` }}
      >
        {broken ? (
          <div
            className="flex h-full w-full items-center justify-center text-2xl font-bold"
            style={{ backgroundColor: `${color}33`, color }}
          >
            {initials(tile.name)}
          </div>
        ) : (
          <img
            src={tile.thumbUrl}
            draggable={false}
            loading="eager"
            alt=""
            width={TILE_W}
            height={TILE_W}
            className="h-full w-full object-cover"
            onError={() => setBroken(true)}
          />
        )}
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
