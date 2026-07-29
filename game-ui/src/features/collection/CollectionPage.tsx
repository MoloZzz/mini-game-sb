import { useEffect, useState } from 'react';
import type { CollectionCardDto } from '@card-game/shared-types';

import { CollectionProgress } from '../inventory/CollectionProgress';
import { CollectionCardDetail } from './CollectionCardDetail';
import { CollectionFilters } from './CollectionFilters';
import { CollectionGallery } from './CollectionGallery';
import { useCollectionCards } from './useCollectionCards';

/** Matches the grid's own responsive column count closely enough that the
 * skeleton doesn't visibly reflow once real tiles replace it. */
const SKELETON_TILE_COUNT = 10;

export function CollectionPage() {
  const { items, total, page, limit, filters, setFilters, setPage, loading, error, progress } =
    useCollectionCards();

  const [selected, setSelected] = useState<CollectionCardDto | null>(null);

  // A page or filter change can drop the selected slot out of view entirely
  // (or its `owned` state can flip) — clearing the selection avoids a detail
  // panel that no longer matches what the grid is showing.
  useEffect(() => {
    setSelected((prev) => {
      if (!prev) return prev;
      const updated = items.find((i) => i.id === prev.id);
      return updated && updated.owned ? updated : null;
    });
  }, [items]);

  function handleFiltersChange(next: typeof filters) {
    setFilters(next);
    setSelected(null);
  }

  function handleSelect(entry: CollectionCardDto) {
    if (entry.owned) setSelected(entry);
  }

  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 px-6 py-8 text-neutral-100">
      <h1 className="text-2xl font-bold">Collection</h1>

      {progress ? (
        <CollectionProgress progress={progress} />
      ) : (
        // Same footprint as the real panel so it doesn't shift layout once
        // the first fetch resolves.
        <div className="h-[124px] animate-pulse rounded-lg border border-neutral-800 bg-neutral-900" />
      )}

      <CollectionFilters value={filters} onChange={handleFiltersChange} />

      {error && (
        <div className="rounded-md border border-red-500/50 bg-red-500/10 px-4 py-2 text-sm text-red-300">
          {error}
        </div>
      )}

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
              <p className="text-neutral-300">No cards match these filters.</p>
            </div>
          ) : (
            <CollectionGallery items={items} selectedId={selected?.id ?? null} onSelect={handleSelect} />
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

      {selected?.card && (
        <CollectionCardDetail key={selected.id} card={selected.card} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}
