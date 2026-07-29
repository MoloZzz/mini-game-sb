import { ELEMENTS, RARITIES, RARITY_META, type Element, type Rarity } from '@card-game/shared-types';

import type { CollectionFilterState } from './useCollectionCards';

export interface CollectionFiltersProps {
  value: CollectionFilterState;
  onChange: (next: CollectionFilterState) => void;
}

function chipClasses(active: boolean): string {
  return `rounded-full border px-3 py-1 text-xs font-semibold capitalize transition-colors ${
    active
      ? 'border-amber-400 bg-amber-400/10 text-amber-300'
      : 'border-neutral-700 text-neutral-400 hover:border-neutral-500'
  }`;
}

/** Same single-select chip pattern as InventoryFilters — the dex has no sort
 * control since ordering (rarity desc, name asc) is fixed server-side. */
export function CollectionFilters({ value, onChange }: CollectionFiltersProps) {
  const hasActiveFilter = value.rarity !== undefined || value.element !== undefined;

  function toggleRarity(rarity: Rarity) {
    onChange({ ...value, rarity: value.rarity === rarity ? undefined : rarity });
  }

  function toggleElement(element: Element) {
    onChange({ ...value, element: value.element === element ? undefined : element });
  }

  function clearFilters() {
    onChange({ rarity: undefined, element: undefined });
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="w-16 shrink-0 text-xs uppercase tracking-wide text-neutral-500">Rarity</span>
        {RARITIES.map((rarity) => {
          const active = value.rarity === rarity;
          const color = RARITY_META[rarity].color;
          return (
            <button
              key={rarity}
              type="button"
              aria-pressed={active}
              onClick={() => toggleRarity(rarity)}
              className="rounded-full border px-3 py-1 text-xs font-semibold capitalize transition-colors"
              style={{
                borderColor: color,
                backgroundColor: active ? `${color}33` : 'transparent',
                color: active ? color : '#a3a3a3',
              }}
            >
              {rarity}
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="w-16 shrink-0 text-xs uppercase tracking-wide text-neutral-500">Element</span>
        <button
          type="button"
          aria-pressed={value.element === undefined}
          onClick={() => onChange({ ...value, element: undefined })}
          className={chipClasses(value.element === undefined)}
        >
          Any
        </button>
        {ELEMENTS.map((element) => (
          <button
            key={element}
            type="button"
            aria-pressed={value.element === element}
            onClick={() => toggleElement(element)}
            className={chipClasses(value.element === element)}
          >
            {element}
          </button>
        ))}
      </div>

      {hasActiveFilter && (
        <button
          type="button"
          onClick={clearFilters}
          className="self-start text-xs font-semibold text-neutral-400 underline underline-offset-2 hover:text-neutral-200"
        >
          Clear filters
        </button>
      )}
    </div>
  );
}
