import { useState } from 'react';
import { RARITY_META, type InventoryItemDto } from '@card-game/shared-types';

export interface InventoryGridProps {
  items: InventoryItemDto[];
  selectedInstanceId: string | null;
  onSelect: (item: InventoryItemDto) => void;
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? '')
    .join('');
}

interface InventoryTileProps {
  item: InventoryItemDto;
  selected: boolean;
  onSelect: () => void;
}

function InventoryTile({ item, selected, onSelect }: InventoryTileProps) {
  // A broken thumb must never blank a tile — fall back to a rarity-tinted
  // block with the card's initials, same pattern as the reel and reveal.
  const [broken, setBroken] = useState(false);
  const { card, copies } = item;
  const color = RARITY_META[card.rarity].color;
  const metaLine = [card.element, card.archetype].filter(Boolean).join(' · ');

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`flex flex-col overflow-hidden rounded-lg border-2 bg-neutral-900 text-left transition-transform hover:-translate-y-0.5 ${
        selected ? 'ring-2 ring-amber-400' : ''
      }`}
      style={{ borderColor: color }}
    >
      <div className="relative aspect-square w-full" style={{ backgroundColor: `${color}1a` }}>
        {broken ? (
          <div
            className="flex h-full w-full items-center justify-center text-xl font-bold"
            style={{ backgroundColor: `${color}33`, color }}
          >
            {initials(card.name)}
          </div>
        ) : (
          <img
            src={card.thumbUrl}
            alt=""
            draggable={false}
            loading="lazy"
            className="h-full w-full object-cover"
            onError={() => setBroken(true)}
          />
        )}

        {/* One tile per distinct card, not per instance (ADR-012): the API
            already groups by card and hands back `copies`, so 3 identical
            drops read as one tile with a badge instead of 3 tiles. */}
        {copies > 1 && (
          <span className="absolute right-1 top-1 rounded-full bg-neutral-950/80 px-2 py-0.5 text-xs font-bold text-neutral-100">
            ×{copies}
          </span>
        )}
      </div>

      <div className="px-2 py-1.5">
        <p className="truncate text-xs font-semibold text-neutral-100">{card.name}</p>
        {metaLine && (
          <p className="truncate text-[10px] uppercase tracking-wide text-neutral-500">{metaLine}</p>
        )}
      </div>
    </button>
  );
}

export function InventoryGrid({ items, selectedInstanceId, onSelect }: InventoryGridProps) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
      {items.map((item) => (
        <InventoryTile
          key={item.instanceId}
          item={item}
          selected={item.instanceId === selectedInstanceId}
          onSelect={() => onSelect(item)}
        />
      ))}
    </div>
  );
}
