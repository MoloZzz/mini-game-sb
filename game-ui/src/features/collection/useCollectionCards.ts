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
  /** The page currently represented by `items`, updated only after a successful response. */
  displayedPage: number;
  page: number;
  limit: number;
  filters: CollectionFilterState;
  setFilters: (next: CollectionFilterState) => void;
  setPage: (page: number) => void;
  /** Bypasses the short route-transition cache for a user-initiated retry. */
  refresh: () => void;
  /** A new query is loading while the last resolved grid remains usable. */
  refreshing: boolean;
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
  const [items, setItems] = useState<CollectionCardDto[]>(() => cachedPage?.items ?? []);
  const [total, setTotal] = useState(() => cachedPage?.total ?? 0);
  const [displayedPage, setDisplayedPage] = useState(() => cachedPage?.page ?? page);
  // A collection page can legitimately be empty, so this cannot be inferred
  // from `items.length`. It distinguishes a first visit from a transition
  // where keeping the previous (possibly empty) response is the right UX.
  const [hasResolvedPage, setHasResolvedPage] = useState(() => cachedPage !== undefined);
  const [loading, setLoading] = useState(() => cachedPage === undefined);
  const [refreshing, setRefreshing] = useState(false);
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
    setError(null);

    const prefetchNextPage = (pageResult: CollectionCardsResponse) => {
      const totalPages = Math.ceil(pageResult.total / PAGE_SIZE);
      if (pageResult.page >= totalPages) return;

      const nextPageQuery: ListCollectionCardsQuery = {
        ...filters,
        page: pageResult.page + 1,
        limit: PAGE_SIZE,
      };
      const nextPageCacheKey = createDataCacheKey(
        scope,
        DATA_CACHE_RESOURCES.collectionCards,
        JSON.stringify(nextPageQuery),
      );

      // This is intentionally detached from visible state: the cache shares
      // the request with a later navigation, and neither a prefetch failure
      // nor an old response can replace the grid the player is viewing.
      void loadCachedData(nextPageCacheKey, () => getCollectionCards(nextPageQuery)).catch(() => undefined);
    };

    const applyPage = (pageResult: CollectionCardsResponse) => {
      if (cancelled) return;
      // The page, its cards and its total always move together. This avoids a
      // transient state where the controls claim the new page while showing a
      // half-updated grid.
      setItems(pageResult.items);
      setTotal(pageResult.total);
      setDisplayedPage(pageResult.page);
      setHasResolvedPage(true);
      setLoading(false);
      setRefreshing(false);
      prefetchNextPage(pageResult);
    };

    const showError = (err: unknown) => {
      if (cancelled) return;
      setError(errorMessage(err));
      setLoading(false);
      setRefreshing(false);
    };

    // Progress and goal are independent of pagination. Keeping their cached
    // values means a page switch waits only for the page itself, not for three
    // unrelated requests to finish together.
    Promise.all([
      loadCachedData(progressCacheKey, getCollectionProgress, { force }),
      loadCachedData(goalCacheKey, getCollectionGoal, { force }),
    ])
      .then(([progressResult, goalResult]) => {
        if (cancelled) return;
        setProgress(progressResult);
        setGoal(goalResult);
      })
      .catch((err: unknown) => {
        // A progress-panel failure must not make the card grid look settled
        // before its own page request has completed.
        if (!cancelled) setError(errorMessage(err));
      });

    if (cachedPage !== undefined) {
      applyPage(cachedPage);
    } else {
      // Do not replace a resolved grid with skeletons during filter/page
      // changes. Only the first visit needs a blocking placeholder.
      setLoading(!hasResolvedPage);
      setRefreshing(hasResolvedPage);
      loadCachedData(cardsCacheKey, () => getCollectionCards(pageQuery), { force })
        .then(applyPage)
        .catch(showError);
    }

    return () => {
      cancelled = true;
    };
  }, [cardsCacheKey, filters, goalCacheKey, hasResolvedPage, pageQuery, progressCacheKey, reloadToken, scope]);

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
    displayedPage,
    page,
    limit: PAGE_SIZE,
    filters,
    setFilters,
    setPage,
    refresh,
    refreshing,
    loading,
    error,
    progress,
    goal,
  };
}
