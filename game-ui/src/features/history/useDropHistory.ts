import { useCallback, useEffect, useState } from 'react';
import type { DropHistoryItemDto } from '@card-game/shared-types';

import { getDrops } from '@/lib/api';
import { ApiClientError, isApiErrorCode, USER_MESSAGES } from '@/lib/apiError';
import { getToken } from '@/lib/auth';
import {
  createDataCacheKey,
  DATA_CACHE_RESOURCES,
  getCachedData,
  loadCachedData,
} from '@/lib/dataCache';

/**
 * The history screen shows a full page rather than the lobby's old ambient
 * strip, so it asks for more than the strip's 20. `GET /me/drops` validates
 * limit as 1..100 and has no pagination — 50 is the largest page worth
 * rendering at once here.
 */
const DROPS_LIMIT = 50;

export interface DropHistoryData {
  drops: DropHistoryItemDto[];
  loading: boolean;
  error: string | null;
  /** Re-runs the GET, bypassing the cached snapshot — wired to the error banner. */
  refresh: () => void;
}

function errorMessage(err: unknown): string {
  if (err instanceof ApiClientError && isApiErrorCode(err.code)) return USER_MESSAGES[err.code];
  return 'Something went wrong.';
}

/**
 * Owns the single GET behind the history screen. It shares `dataCache`'s
 * `drops` resource with the rest of the app, so opening a case invalidates
 * this screen's snapshot the same way it invalidates inventory and collection.
 */
export function useDropHistory(): DropHistoryData {
  const scope = getToken();
  const dropsCacheKey = createDataCacheKey(scope, DATA_CACHE_RESOURCES.drops, String(DROPS_LIMIT));
  const cachedDrops = getCachedData<DropHistoryItemDto[]>(dropsCacheKey);
  const [drops, setDrops] = useState<DropHistoryItemDto[]>(() => cachedDrops ?? []);
  const [loading, setLoading] = useState(() => cachedDrops === undefined);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const force = reloadToken > 0;
    const cached = force ? undefined : getCachedData<DropHistoryItemDto[]>(dropsCacheKey);

    if (cached !== undefined) {
      setDrops(cached);
      setError(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    loadCachedData(dropsCacheKey, () => getDrops(DROPS_LIMIT), { force })
      .then((next) => {
        if (!cancelled) setDrops(next);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(errorMessage(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [dropsCacheKey.id, reloadToken]);

  const refresh = useCallback(() => setReloadToken((t) => t + 1), []);

  return { drops, loading, error, refresh };
}
