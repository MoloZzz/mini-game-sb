import { useCallback, useEffect, useState } from "react";
import type {
  CollectionProgressDto,
  InventoryItemDto,
  ListInventoryQuery,
} from "@card-game/shared-types";

import { getCollectionProgress, getInventory, sellInstance } from "@/lib/api";
import { ApiClientError, isApiErrorCode, USER_MESSAGES } from "@/lib/apiError";

/** Grid page size. Small on purpose so pagination controls are actually exercised. */
const PAGE_SIZE = 24;

/** The subset of ListInventoryQuery that InventoryFilters is allowed to touch. */
export type InventoryFilterState = Pick<
  ListInventoryQuery,
  "rarity" | "element" | "sort"
>;

function errorMessage(err: unknown): string {
  if (err instanceof ApiClientError && isApiErrorCode(err.code))
    return USER_MESSAGES[err.code];
  return "Something went wrong.";
}

export interface UseInventoryResult {
  items: InventoryItemDto[];
  total: number;
  page: number;
  limit: number;
  filters: InventoryFilterState;
  setFilters: (next: InventoryFilterState) => void;
  setPage: (page: number) => void;
  loading: boolean;
  error: string | null;
  progress: CollectionProgressDto | null;
  sell: (instanceId: string) => Promise<void>;
  selling: boolean;
  sellError: string | null;
  clearSellError: () => void;
}

/**
 * Owns the inventory screen's data: the filtered/paginated grid request, the
 * dedicated `GET /me/collection` request that feeds the collection-progress
 * bar (server-computed against the real approved-card pool, never a client
 * constant), and the sell mutation. Kept out of Inventory.tsx so the screen
 * stays presentational.
 */
export function useInventory(): UseInventoryResult {
  const [filters, setFiltersState] = useState<InventoryFilterState>({});
  const [page, setPageState] = useState(1);
  const [items, setItems] = useState<InventoryItemDto[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<CollectionProgressDto | null>(null);
  const [selling, setSelling] = useState(false);
  const [sellError, setSellError] = useState<string | null>(null);
  // Bumped after a successful sell to force the effect below to refetch —
  // `filters`/`page` didn't change, but the data behind them did.
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    const pageQuery: ListInventoryQuery = {
      ...filters,
      page,
      limit: PAGE_SIZE,
    };

    Promise.all([getInventory(pageQuery), getCollectionProgress()])
      .then(([pageResult, progressResult]) => {
        if (cancelled) return;
        setItems(pageResult.items);
        setTotal(pageResult.total);
        setProgress(progressResult);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(errorMessage(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [filters, page, reloadToken]);

  const setFilters = useCallback((next: InventoryFilterState) => {
    setFiltersState(next);
    // A changed filter can shrink the result set below the current page —
    // jumping back to page 1 is simpler and safer than clamping.
    setPageState(1);
  }, []);

  const setPage = useCallback((next: number) => {
    setPageState(next);
  }, []);

  const sell = useCallback(async (instanceId: string) => {
    setSelling(true);
    setSellError(null);
    try {
      await sellInstance(instanceId);
      // `copies` and the progress bar both shift after a sell — a full
      // refetch is simpler and safer than hand-patching grouped counts
      // client-side and risking drift from the server's truth.
      setReloadToken((t) => t + 1);
    } catch (err) {
      // LAST_COPY (the server's defense against destroying a player's last
      // copy of a card) and any other failure surface as a message here
      // rather than as an unhandled rejection — the UI already avoids
      // offering the sell action on the last copy, but the hook stays
      // defensive in case the two ever disagree (e.g. a stale selection).
      setSellError(errorMessage(err));
    } finally {
      setSelling(false);
    }
  }, []);

  const clearSellError = useCallback(() => setSellError(null), []);

  return {
    items,
    total,
    page,
    limit: PAGE_SIZE,
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
  };
}
