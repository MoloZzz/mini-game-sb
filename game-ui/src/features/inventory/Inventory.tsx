import { useEffect, useState } from 'react';
import type { InventoryItemDto } from '@card-game/shared-types';

import { CardDetail } from './CardDetail';
import { CollectionProgress } from './CollectionProgress';
import { InventoryFilters } from './InventoryFilters';
import { InventoryGrid } from './InventoryGrid';
import { useInventory, type InventoryFilterState } from './useInventory';

/** Matches the grid's own responsive column count closely enough that the
 * skeleton doesn't visibly reflow once real tiles replace it. */
const SKELETON_TILE_COUNT = 10;

export function Inventory() {
  const {
    items,
    total,
    page,
    limit,
    filters,
    setFilters,
    setPage,
    loading,
    error,
    progress,
    sell,
    selling,
    sellError,
    clearSellError,
  } = useInventory();

  const [selected, setSelected] = useState<InventoryItemDto | null>(null);

  // After a sell, `items` refetches and the sold card's `instanceId` moves to
  // its next-oldest instance — keep the detail panel pointed at the same
  // *card* rather than showing stale copies/instanceId or silently closing.
  useEffect(() => {
    setSelected((prev) => {
      if (!prev) return prev;
      const updated = items.find((i) => i.card.id === prev.card.id);
      if (!updated) return prev;
      if (updated.instanceId === prev.instanceId && updated.copies === prev.copies) return prev;
      return updated;
    });
  }, [items]);

  const totalPages = Math.max(1, Math.ceil(total / limit));

  function handleFiltersChange(next: InventoryFilterState) {
    setFilters(next);
    // A filter change can drop the selected card out of view entirely —
    // clearing the selection avoids a detail panel that no longer matches
    // what the grid is showing.
    setSelected(null);
  }

  function handleSelect(item: InventoryItemDto) {
    clearSellError();
    setSelected(item);
  }

  function handleSell(instanceId: string) {
    void sell(instanceId);
  }

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 px-6 py-8 text-neutral-100">
      <h1 className="text-2xl font-bold">Inventory</h1>

      {progress ? (
        <CollectionProgress progress={progress} />
      ) : (
        // Same footprint as the real panel so it doesn't shift layout once
        // the first fetch resolves.
        <div className="h-[124px] animate-pulse rounded-lg border border-neutral-800 bg-neutral-900" />
      )}

      <InventoryFilters value={filters} onChange={handleFiltersChange} />

      {error && (
        <div className="rounded-md border border-red-500/50 bg-red-500/10 px-4 py-2 text-sm text-red-300">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 md:grid-cols-[1fr_280px]">
        <div className="flex flex-col gap-4">
          {loading ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {Array.from({ length: SKELETON_TILE_COUNT }).map((_, i) => (
                <div
                  key={i}
                  className="aspect-square animate-pulse rounded-lg border-2 border-neutral-800 bg-neutral-900"
                />
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-neutral-700 py-16 text-center">
              <p className="text-neutral-300">No cards yet — open a case to start your collection.</p>
            </div>
          ) : (
            <InventoryGrid
              items={items}
              selectedInstanceId={selected?.instanceId ?? null}
              onSelect={handleSelect}
            />
          )}

          {!loading && total > limit && (
            <div className="flex items-center justify-center gap-3 text-sm text-neutral-400">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
                className="rounded-md border border-neutral-700 px-3 py-1 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Prev
              </button>
              <span>
                Page {page} / {totalPages}
              </span>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage(page + 1)}
                className="rounded-md border border-neutral-700 px-3 py-1 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Next
              </button>
            </div>
          )}
        </div>

        <div>
          {selected ? (
            <CardDetail
              key={selected.card.id}
              item={selected}
              onSell={handleSell}
              selling={selling}
              sellError={sellError}
            />
          ) : (
            <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-neutral-800 px-4 py-16 text-center text-sm text-neutral-500">
              Select a card to see details.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
