import { useEffect, useState } from 'react';
import type { CollectionCardDto } from '@card-game/shared-types';

import { CardDetailModal } from '@/components/card/CardDetailModal';
import { CardGrid } from '@/components/card/CardGrid';
import { CardTile, LockedCardTile } from '@/components/card/CardTile';
import { CardFilters } from '@/components/filters/CardFilters';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { Pagination } from '@/components/ui/Pagination';
import { TileSkeleton } from '@/components/ui/TileSkeleton';

import { CollectionProgress } from '../inventory/CollectionProgress';
import { CollectionGoal } from './CollectionGoal';
import { useCollectionCards } from './useCollectionCards';

export function CollectionPage() {
  const { items, total, page, limit, filters, setFilters, setPage, loading, error, progress, goal } =
    useCollectionCards();

  const [selected, setSelected] = useState<CollectionCardDto | null>(null);

  // A page or filter change can drop the selected slot out of view entirely
  // (or its `owned` state can flip) — clearing the selection avoids a detail
  // view that no longer matches what the grid is showing.
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

  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-6 text-neutral-100 sm:px-6 sm:py-8">
      <h1 className="text-2xl font-bold">Collection</h1>

      {progress ? (
        <CollectionProgress progress={progress} />
      ) : (
        // Same footprint as the real panel so it doesn't shift layout once
        // the first fetch resolves.
        <div className="h-[124px] animate-pulse rounded-lg border border-neutral-800 bg-neutral-900" />
      )}

      {goal && <CollectionGoal goal={goal} />}

      <CardFilters value={filters} onChange={handleFiltersChange} />

      {error && <ErrorBanner>{error}</ErrorBanner>}

      <div className="flex flex-col gap-4">
        {loading ? (
          <CardGrid>
            <TileSkeleton />
          </CardGrid>
        ) : items.length === 0 ? (
          <EmptyState>No cards match these filters.</EmptyState>
        ) : (
          // Every approved card gets a slot, in the order the server sends
          // them. `entry.card` is only non-null when `entry.owned` is true —
          // the masking happens server-side, so this screen never has real art
          // to accidentally render for a locked slot.
          <CardGrid>
            {items.map((entry) =>
              entry.owned && entry.card ? (
                <CardTile
                  key={entry.id}
                  card={entry.card}
                  selected={entry.id === selected?.id}
                  onSelect={() => setSelected(entry)}
                />
              ) : (
                <LockedCardTile key={entry.id} rarity={entry.rarity} />
              ),
            )}
          </CardGrid>
        )}

        {!loading && total > limit && (
          <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
        )}
      </div>

      {selected?.card && (
        <CardDetailModal key={selected.id} card={selected.card} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}
