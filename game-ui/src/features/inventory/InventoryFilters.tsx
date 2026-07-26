import { ELEMENTS, RARITIES, RARITY_META, type Element, type ListInventoryQuery, type Rarity } from '@card-game/shared-types';

import type { InventoryFilterState } from './useInventory';

export interface InventoryFiltersProps {
  value: InventoryFilterState;
  onChange: (next: InventoryFilterState) => void;
}

const SORT_OPTIONS: ReadonlyArray<{ value: NonNullable<ListInventoryQuery['sort']>; label: string }> = [
  { value: 'rarity_desc', label: 'Rarity: high to low' },
  { value: 'rarity_asc', label: 'Rarity: low to high' },
  { value: 'acquired_desc', label: 'Recently acquired' },
  { value: 'name_asc', label: 'Name (A–Z)' },
];

const DEFAULT_SORT: NonNullable<ListInventoryQuery['sort']> = 'rarity_desc';

function chipClasses(active: boolean): string {
  return `rounded-full border px-3 py-1 text-xs font-semibold capitalize transition-colors ${
    active
      ? 'border-amber-400 bg-amber-400/10 text-amber-300'
      : 'border-neutral-700 text-neutral-400 hover:border-neutral-500'
  }`;
}

/**
 * Rarity and element are each a single value in ListInventoryQuery (not an
 * array), so the chips are single-select with a click-to-toggle-off —
 * matching what the contract can actually express, not inventing a
 * multi-select the API would silently ignore.
 */
export function InventoryFilters({ value, onChange }: InventoryFiltersProps) {
  const hasActiveFilter = value.rarity !== undefined || value.element !== undefined;

  function toggleRarity(rarity: Rarity) {
    onChange({ ...value, rarity: value.rarity === rarity ? undefined : rarity });
  }

  function toggleElement(element: Element) {
    onChange({ ...value, element: value.element === element ? undefined : element });
  }

  function handleSortChange(sort: string) {
    onChange({ ...value, sort: sort as ListInventoryQuery['sort'] });
  }

  function clearFilters() {
    onChange({ ...value, rarity: undefined, element: undefined });
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

      <div className="flex flex-wrap items-center gap-3">
        <label htmlFor="inventory-sort" className="w-16 shrink-0 text-xs uppercase tracking-wide text-neutral-500">
          Sort
        </label>
        <select
          id="inventory-sort"
          value={value.sort ?? DEFAULT_SORT}
          onChange={(e) => handleSortChange(e.target.value)}
          className="rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1 text-xs text-neutral-200"
        >
          {SORT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        {hasActiveFilter && (
          <button
            type="button"
            onClick={clearFilters}
            className="text-xs font-semibold text-neutral-400 underline underline-offset-2 hover:text-neutral-200"
          >
            Clear filters
          </button>
        )}
      </div>
    </div>
  );
}
