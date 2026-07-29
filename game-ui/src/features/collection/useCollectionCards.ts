import { useCallback, useEffect, useState } from 'react';
import type {
  CollectionCardDto,
  CollectionGoalDto,
  CollectionProgressDto,
  ListCollectionCardsQuery,
} from '@card-game/shared-types';

import { getCollectionCards, getCollectionGoal, getCollectionProgress } from '@/lib/api';
import { ApiClientError, isApiErrorCode, USER_MESSAGES } from '@/lib/apiError';

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
  const [items, setItems] = useState<CollectionCardDto[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<CollectionProgressDto | null>(null);
  const [goal, setGoal] = useState<CollectionGoalDto | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    Promise.all([
      getCollectionCards({ ...filters, page, limit: PAGE_SIZE }),
      getCollectionProgress(),
      getCollectionGoal(),
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
  }, [filters, page]);

  const setFilters = useCallback((next: CollectionFilterState) => {
    setFiltersState(next);
    // A changed filter can shrink the result set below the current page —
    // jumping back to page 1 is simpler and safer than clamping.
    setPageState(1);
  }, []);

  const setPage = useCallback((next: number) => {
    setPageState(next);
  }, []);

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
    goal,
  };
}
