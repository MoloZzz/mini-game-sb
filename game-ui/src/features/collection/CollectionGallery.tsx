import { useState } from 'react';
import { RARITY_META, type CollectionCardDto, type Rarity } from '@card-game/shared-types';

export interface CollectionGalleryProps {
  items: CollectionCardDto[];
  selectedId: string | null;
  onSelect: (entry: CollectionCardDto) => void;
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? '')
    .join('');
}

/** A card the player hasn't pulled yet — a rarity-tinted "?" so the shape of
 * the collection is visible without leaking art or a name the server never
 * even sent. */
function LockedTile({ rarity }: { rarity: Rarity }) {
  const color = RARITY_META[rarity].color;
  return (
    <div
      className="flex flex-col overflow-hidden rounded-lg border-2 border-dashed bg-neutral-900"
      style={{ borderColor: `${color}66` }}
    >
      <div
        className="flex aspect-square w-full items-center justify-center text-3xl font-bold"
        style={{ backgroundColor: `${color}14`, color: `${color}99` }}
      >
        ?
      </div>
      <div className="px-2 py-1.5">
        <p className="truncate text-xs font-semibold capitalize text-neutral-500">{rarity}</p>
      </div>
    </div>
  );
}

function UnlockedTile({
  card,
  selected,
  onSelect,
}: {
  card: NonNullable<CollectionCardDto['card']>;
  selected: boolean;
  onSelect: () => void;
}) {
  // A broken thumb must never blank a tile — same fallback pattern as the
  // inventory grid and the drop reveal.
  const [broken, setBroken] = useState(false);
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
            alt={card.name}
            draggable={false}
            loading="lazy"
            className="h-full w-full object-cover"
            onError={() => setBroken(true)}
          />
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

/**
 * The dex grid: every approved card gets a slot, in the order the server
 * sends them. `entry.card` is only non-null when `entry.owned` is true — the
 * masking happens server-side, so this component never has real art to
 * accidentally render for a locked slot.
 */
export function CollectionGallery({ items, selectedId, onSelect }: CollectionGalleryProps) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
      {items.map((entry) =>
        entry.owned && entry.card ? (
          <UnlockedTile
            key={entry.id}
            card={entry.card}
            selected={entry.id === selectedId}
            onSelect={() => onSelect(entry)}
          />
        ) : (
          <LockedTile key={entry.id} rarity={entry.rarity} />
        ),
      )}
    </div>
  );
}
