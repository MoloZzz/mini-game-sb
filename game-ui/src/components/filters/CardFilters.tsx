import { ELEMENTS, RARITIES, type Element, type ListInventoryQuery, type Rarity } from '@card-game/shared-types';

import { Chip } from '@/components/ui/Chip';
import { Panel } from '@/components/ui/Panel';

export type CardSort = NonNullable<ListInventoryQuery['sort']>;

/** The subset of filter state this component owns. Screens keep their own
 * wider state shape (page, limit, …) and spread it back around this. */
export interface CardFilterValue {
  rarity?: Rarity;
  element?: Element;
  sort?: CardSort;
}

export interface CardFiltersProps<T extends CardFilterValue> {
  value: T;
  onChange: (next: T) => void;
  /** Omit to hide the sort control — the dex's order is fixed server-side. */
  sortIdPrefix?: string;
}

const SORT_OPTIONS: ReadonlyArray<{ value: CardSort; label: string }> = [
  { value: 'rarity_desc', label: 'Rarity: high to low' },
  { value: 'rarity_asc', label: 'Rarity: low to high' },
  { value: 'acquired_desc', label: 'Recently acquired' },
  { value: 'name_asc', label: 'Name (A–Z)' },
];

const DEFAULT_SORT: CardSort = 'rarity_desc';

/**
 * Rarity and element are each a single value in the list queries (not an
 * array), so the chips are single-select with a click-to-toggle-off —
 * matching what the contract can actually express, not inventing a
 * multi-select the API would silently ignore.
 *
 * The inventory and collection each had their own copy of this, identical
 * except for the sort row; that row is now a prop.
 */
export function CardFilters<T extends CardFilterValue>({
  value,
  onChange,
  sortIdPrefix,
}: CardFiltersProps<T>) {
  const hasActiveFilter = value.rarity !== undefined || value.element !== undefined;

  function toggleRarity(rarity: Rarity) {
    onChange({ ...value, rarity: value.rarity === rarity ? undefined : rarity });
  }

  function toggleElement(element: Element) {
    onChange({ ...value, element: value.element === element ? undefined : element });
  }

  return (
    <Panel padding="sm" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="w-16 shrink-0 text-xs uppercase tracking-wide text-neutral-500">Rarity</span>
        {RARITIES.map((rarity) => (
          <Chip
            key={rarity}
            rarity={rarity}
            active={value.rarity === rarity}
            onClick={() => toggleRarity(rarity)}
          >
            {rarity}
          </Chip>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="w-16 shrink-0 text-xs uppercase tracking-wide text-neutral-500">Element</span>
        <Chip
          active={value.element === undefined}
          onClick={() => onChange({ ...value, element: undefined })}
        >
          Any
        </Chip>
        {ELEMENTS.map((element) => (
          <Chip
            key={element}
            active={value.element === element}
            onClick={() => toggleElement(element)}
          >
            {element}
          </Chip>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {sortIdPrefix && (
          <>
            <label
              htmlFor={`${sortIdPrefix}-sort`}
              className="w-16 shrink-0 text-xs uppercase tracking-wide text-neutral-500"
            >
              Sort
            </label>
            <select
              id={`${sortIdPrefix}-sort`}
              value={value.sort ?? DEFAULT_SORT}
              onChange={(e) => onChange({ ...value, sort: e.target.value as CardSort })}
              className="rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1 text-xs text-neutral-200"
            >
              {SORT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </>
        )}

        {hasActiveFilter && (
          <button
            type="button"
            onClick={() => onChange({ ...value, rarity: undefined, element: undefined })}
            className="text-xs font-semibold text-neutral-400 underline underline-offset-2 hover:text-neutral-200"
          >
            Clear filters
          </button>
        )}
      </div>
    </Panel>
  );
}
