import type { ReactNode } from 'react';
import type { CardDto, Rarity } from '@card-game/shared-types';

import { rarityColor, rarityTint } from '@/lib/rarityStyle';

import { CardArt } from './CardArt';

export interface CardTileProps {
  card: CardDto;
  selected?: boolean;
  onSelect?: () => void;
  /** Overlaid on the art — the inventory's `×N` copies count. */
  badge?: ReactNode;
}

const TILE_CLASSES =
  'flex flex-col overflow-hidden rounded-lg border-2 bg-neutral-900 text-left transition-transform hover:-translate-y-0.5';

function MetaLine({ card }: { card: CardDto }) {
  const metaLine = [card.element, card.archetype].filter(Boolean).join(' · ');
  if (!metaLine) return null;
  return <p className="truncate text-[10px] uppercase tracking-wide text-neutral-500">{metaLine}</p>;
}

/**
 * One tile of a `CardGrid`. The inventory's `InventoryTile` and the
 * collection's `UnlockedTile` were forty near-identical lines apiece; the only
 * real difference — the copies badge — is now a prop.
 */
export function CardTile({ card, selected = false, onSelect, badge }: CardTileProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`${TILE_CLASSES} ${selected ? 'ring-2 ring-amber-400' : ''}`}
      style={{ borderColor: rarityColor(card.rarity) }}
    >
      <div className="relative aspect-square w-full">
        <CardArt
          card={card}
          source="thumb"
          decorative
          initialsFontSize="1.25rem"
          className="h-full w-full"
          style={{ backgroundColor: rarityTint(card.rarity, 'surface') }}
        />
        {badge}
      </div>

      <div className="px-2 py-1.5">
        <p className="truncate text-xs font-semibold text-neutral-100">{card.name}</p>
        <MetaLine card={card} />
      </div>
    </button>
  );
}

/**
 * A card the player hasn't pulled yet — a rarity-tinted "?" so the shape of
 * the collection is visible without leaking art or a name the server never
 * even sent.
 */
export function LockedCardTile({ rarity }: { rarity: Rarity }) {
  return (
    <div
      className="flex flex-col overflow-hidden rounded-lg border-2 border-dashed bg-neutral-900"
      style={{ borderColor: rarityTint(rarity, 'outlineSoft') }}
    >
      <div
        className="flex aspect-square w-full items-center justify-center text-3xl font-bold"
        style={{ backgroundColor: rarityTint(rarity, 'ghost'), color: rarityTint(rarity, 'muted') }}
      >
        ?
      </div>
      <div className="px-2 py-1.5">
        <p className="truncate text-xs font-semibold capitalize text-neutral-500">{rarity}</p>
      </div>
    </div>
  );
}
