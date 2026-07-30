import { useEffect, useState } from 'react';
import type { InventoryItemDto } from '@card-game/shared-types';

import { CardGrid } from '@/components/card/CardGrid';
import { CardTile } from '@/components/card/CardTile';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { Pagination } from '@/components/ui/Pagination';
import { TileSkeleton } from '@/components/ui/TileSkeleton';

import { CardFilters } from '@/components/filters/CardFilters';

import { CardDetail } from './CardDetail';
import { CollectionProgress } from './CollectionProgress';
import { useInventory, type InventoryFilterState } from './useInventory';

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
  // its next-oldest instance — keep the detail view pointed at the same
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
    // clearing the selection avoids a detail view that no longer matches
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
    <div className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-6 text-neutral-100 sm:px-6 sm:py-8">
      <h1 className="text-2xl font-bold">Inventory</h1>

      {progress ? (
        <CollectionProgress progress={progress} />
      ) : (
        // Same footprint as the real panel so it doesn't shift layout once
        // the first fetch resolves.
        <div className="h-[124px] animate-pulse rounded-lg border border-neutral-800 bg-neutral-900" />
      )}

      <CardFilters value={filters} onChange={handleFiltersChange} sortIdPrefix="inventory" />

      {error && <ErrorBanner>{error}</ErrorBanner>}

      <div className="flex flex-col gap-4">
        {loading ? (
          <CardGrid>
            <TileSkeleton />
          </CardGrid>
        ) : items.length === 0 ? (
          <EmptyState>No cards yet — open a case to start your collection.</EmptyState>
        ) : (
          <CardGrid>
            {items.map((item) => (
              <CardTile
                key={item.instanceId}
                card={item.card}
                selected={item.instanceId === selected?.instanceId}
                onSelect={() => handleSelect(item)}
                // One tile per distinct card, not per instance (ADR-012): the API
                // already groups by card and hands back `copies`, so 3 identical
                // drops read as one tile with a badge instead of 3 tiles.
                badge={
                  item.copies > 1 ? (
                    <span className="absolute right-1 top-1 rounded-full bg-neutral-950/80 px-2 py-0.5 text-xs font-bold text-neutral-100">
                      ×{item.copies}
                    </span>
                  ) : undefined
                }
              />
            ))}
          </CardGrid>
        )}

        {!loading && total > limit && (
          <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
        )}
      </div>

      {selected && (
        <CardDetail
          key={selected.card.id}
          item={selected}
          onClose={() => setSelected(null)}
          onSell={handleSell}
          selling={selling}
          sellError={sellError}
        />
      )}
    </div>
  );
}
