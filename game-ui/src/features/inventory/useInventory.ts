import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  CollectionProgressDto,
  InventoryPageDto,
  InventoryItemDto,
  ListInventoryQuery,
} from "@card-game/shared-types";

import { getCollectionProgress, getInventory, sellInstance } from "@/lib/api";
import { ApiClientError, isApiErrorCode, USER_MESSAGES } from "@/lib/apiError";
import { getToken } from "@/lib/auth";
import {
  createDataCacheKey,
  DATA_CACHE_RESOURCES,
  getCachedData,
  invalidateCachedResources,
  loadCachedData,
} from "@/lib/dataCache";

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
  /** Bypasses the short route-transition cache for a user-initiated retry. */
  refresh: () => void;
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
  const scope = getToken();
  const pageQuery = useMemo<ListInventoryQuery>(
    () => ({ ...filters, page, limit: PAGE_SIZE }),
    [filters, page],
  );
  const inventoryCacheKey = useMemo(
    () => createDataCacheKey(scope, DATA_CACHE_RESOURCES.inventory, JSON.stringify(pageQuery)),
    [pageQuery, scope],
  );
  const progressCacheKey = useMemo(
    () => createDataCacheKey(scope, DATA_CACHE_RESOURCES.collectionProgress),
    [scope],
  );
  const cachedPage = getCachedData<InventoryPageDto>(inventoryCacheKey);
  const cachedProgress = getCachedData<CollectionProgressDto>(progressCacheKey);
  const hasCachedData = cachedPage !== undefined && cachedProgress !== undefined;
  const [items, setItems] = useState<InventoryItemDto[]>(() => cachedPage?.items ?? []);
  const [total, setTotal] = useState(() => cachedPage?.total ?? 0);
  const [loading, setLoading] = useState(() => !hasCachedData);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<CollectionProgressDto | null>(() => cachedProgress ?? null);
  const [selling, setSelling] = useState(false);
  const [sellError, setSellError] = useState<string | null>(null);
  // Bumped after a successful sell to force the effect below to refetch —
  // `filters`/`page` didn't change, but the data behind them did.
  const [reloadToken, setReloadToken] = useState(0);
  const processedRefreshToken = useRef(0);

  useEffect(() => {
    let cancelled = false;
    const force = reloadToken !== processedRefreshToken.current;
    processedRefreshToken.current = reloadToken;
    const cachedPage = force ? undefined : getCachedData<InventoryPageDto>(inventoryCacheKey);
    const cachedProgress = force ? undefined : getCachedData<CollectionProgressDto>(progressCacheKey);

    if (cachedPage !== undefined && cachedProgress !== undefined) {
      setItems(cachedPage.items);
      setTotal(cachedPage.total);
      setProgress(cachedProgress);
      setError(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    Promise.all([
      loadCachedData(inventoryCacheKey, () => getInventory(pageQuery), { force }),
      loadCachedData(progressCacheKey, getCollectionProgress, { force }),
    ])
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
  }, [inventoryCacheKey, pageQuery, progressCacheKey, reloadToken]);

  const setFilters = useCallback((next: InventoryFilterState) => {
    setFiltersState(next);
    // A changed filter can shrink the result set below the current page —
    // jumping back to page 1 is simpler and safer than clamping.
    setPageState(1);
  }, []);

  const setPage = useCallback((next: number) => {
    setPageState(next);
  }, []);

  const refresh = useCallback(() => setReloadToken((token) => token + 1), []);

  const sell = useCallback(async (instanceId: string) => {
    setSelling(true);
    setSellError(null);
    try {
      await sellInstance(instanceId);
      invalidateCachedResources(scope, [
        DATA_CACHE_RESOURCES.authMe,
        DATA_CACHE_RESOURCES.player,
        DATA_CACHE_RESOURCES.inventory,
        DATA_CACHE_RESOURCES.collectionProgress,
        DATA_CACHE_RESOURCES.collectionCards,
      ]);
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
  }, [scope]);

  const clearSellError = useCallback(() => setSellError(null), []);

  return {
    items,
    total,
    page,
    limit: PAGE_SIZE,
    filters,
    setFilters,
    setPage,
    refresh,
    loading,
    error,
    progress,
    sell,
    selling,
    sellError,
    clearSellError,
  };
}
