import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  CollectionCardDto,
  CollectionGoalDto,
  CollectionProgressDto,
  CollectionCardsResponse,
  ListCollectionCardsQuery,
} from '@card-game/shared-types';

import { getCollectionCards, getCollectionGoal, getCollectionProgress } from '@/lib/api';
import { ApiClientError, isApiErrorCode, USER_MESSAGES } from '@/lib/apiError';
import { getToken } from '@/lib/auth';
import {
  createDataCacheKey,
  DATA_CACHE_RESOURCES,
  getCachedData,
  loadCachedData,
} from '@/lib/dataCache';

/** Grid page size — matches Inventory's own PAGE_SIZE (24) closely enough,
 * kept as its own constant since the two screens' data shapes are unrelated. */
const PAGE_SIZE = 30;

export type CollectionFilterState = Pick<ListCollectionCardsQuery, 'rarity' | 'element'>;

function errorMessage(err: unknown): string {
  if (err instanceof ApiClientError && isApiErrorCode(err.code)) return USER_MESSAGES[err.code];
  return 'Something went wrong.';
}

export interface UseCollectionCardsResult {
  items: CollectionCardDto[];
  total: number;
  page: number;
  limit: number;
  filters: CollectionFilterState;
  setFilters: (next: CollectionFilterState) => void;
  setPage: (page: number) => void;
  /** Bypasses the short route-transition cache for a user-initiated retry. */
  refresh: () => void;
  loading: boolean;
  error: string | null;
  progress: CollectionProgressDto | null;
  goal: CollectionGoalDto | null;
}

/**
 * Owns the dex screen's data: the filtered/paginated `GET /me/collection/cards`
 * request (each slot pre-masked by the server — locked cards carry no art or
 * name) plus the same `GET /me/collection` summary Inventory uses for the
 * progress bar. Kept out of CollectionPage.tsx so the screen stays presentational.
 */
export function useCollectionCards(): UseCollectionCardsResult {
  const [filters, setFiltersState] = useState<CollectionFilterState>({});
  const [page, setPageState] = useState(1);
  const scope = getToken();
  const pageQuery = useMemo<ListCollectionCardsQuery>(
    () => ({ ...filters, page, limit: PAGE_SIZE }),
    [filters, page],
  );
  const cardsCacheKey = useMemo(
    () => createDataCacheKey(scope, DATA_CACHE_RESOURCES.collectionCards, JSON.stringify(pageQuery)),
    [pageQuery, scope],
  );
  const progressCacheKey = useMemo(
    () => createDataCacheKey(scope, DATA_CACHE_RESOURCES.collectionProgress),
    [scope],
  );
  const goalCacheKey = useMemo(
    () => createDataCacheKey(scope, DATA_CACHE_RESOURCES.collectionGoal),
    [scope],
  );
  const cachedPage = getCachedData<CollectionCardsResponse>(cardsCacheKey);
  const cachedProgress = getCachedData<CollectionProgressDto>(progressCacheKey);
  const cachedGoal = getCachedData<CollectionGoalDto | null>(goalCacheKey);
  const hasCachedData = cachedPage !== undefined && cachedProgress !== undefined && cachedGoal !== undefined;
  const [items, setItems] = useState<CollectionCardDto[]>(() => cachedPage?.items ?? []);
  const [total, setTotal] = useState(() => cachedPage?.total ?? 0);
  const [loading, setLoading] = useState(() => !hasCachedData);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<CollectionProgressDto | null>(() => cachedProgress ?? null);
  const [goal, setGoal] = useState<CollectionGoalDto | null>(() => cachedGoal ?? null);
  const [reloadToken, setReloadToken] = useState(0);
  const processedRefreshToken = useRef(0);

  useEffect(() => {
    let cancelled = false;
    const force = reloadToken !== processedRefreshToken.current;
    processedRefreshToken.current = reloadToken;
    const cachedPage = force ? undefined : getCachedData<CollectionCardsResponse>(cardsCacheKey);
    const cachedProgress = force ? undefined : getCachedData<CollectionProgressDto>(progressCacheKey);
    const cachedGoal = force ? undefined : getCachedData<CollectionGoalDto | null>(goalCacheKey);

    if (cachedPage !== undefined && cachedProgress !== undefined && cachedGoal !== undefined) {
      setItems(cachedPage.items);
      setTotal(cachedPage.total);
      setProgress(cachedProgress);
      setGoal(cachedGoal);
      setError(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    Promise.all([
      loadCachedData(cardsCacheKey, () => getCollectionCards(pageQuery), { force }),
      loadCachedData(progressCacheKey, getCollectionProgress, { force }),
      loadCachedData(goalCacheKey, getCollectionGoal, { force }),
    ])
      .then(([pageResult, progressResult, goalResult]) => {
        if (cancelled) return;
        setItems(pageResult.items);
        setTotal(pageResult.total);
        setProgress(progressResult);
        setGoal(goalResult);
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
  }, [cardsCacheKey, goalCacheKey, pageQuery, progressCacheKey, reloadToken]);

  const setFilters = useCallback((next: CollectionFilterState) => {
    setFiltersState(next);
    // A changed filter can shrink the result set below the current page —
    // jumping back to page 1 is simpler and safer than clamping.
    setPageState(1);
  }, []);

  const setPage = useCallback((next: number) => {
    setPageState(next);
  }, []);

  const refresh = useCallback(() => setReloadToken((token) => token + 1), []);

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
    goal,
  };
}
