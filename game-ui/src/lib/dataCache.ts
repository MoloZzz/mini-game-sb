/**
 * Small, session-scoped cache for read-only screen data.
 *
 * It intentionally lives below the feature hooks rather than inside `api.ts`:
 * the API client remains a transparent transport layer, while callers can
 * choose the cache key, lifetime, and when a read must bypass cached data.
 */
const DEFAULT_TTL_MS = 15_000;

export const DATA_CACHE_RESOURCES = {
  authMe: 'auth-me',
  player: 'player',
  cases: 'cases',
  drops: 'drops',
  inventory: 'inventory',
  collectionProgress: 'collection-progress',
  collectionCards: 'collection-cards',
  collectionGoal: 'collection-goal',
} as const;

export interface DataCacheKey {
  /** Stable map key; callers should treat it as opaque. */
  id: string;
  /** The current token, so cached private data never crosses sessions. */
  scope: string;
  resource: string;
}

interface CacheEntry<T> {
  key: DataCacheKey;
  value?: T;
  expiresAt: number;
  pending?: Promise<T>;
}

export interface CachedLoadOptions {
  /** Ignore a cached value and replace any in-flight request for this key. */
  force?: boolean;
  /** Defaults to a deliberately short 15-second route-transition cache. */
  ttlMs?: number;
}

const cache = new Map<string, CacheEntry<unknown>>();

/**
 * Builds a key for a read response. The token is kept only in memory and is
 * removed with every login/logout session transition (see auth.ts).
 */
export function createDataCacheKey(scope: string | null, resource: string, params = ''): DataCacheKey {
  const normalizedScope = scope ?? 'anonymous';
  return {
    id: JSON.stringify([normalizedScope, resource, params]),
    scope: normalizedScope,
    resource,
  };
}

/** Returns a value only while it is fresh; expired entries are removed. */
export function getCachedData<T>(key: DataCacheKey): T | undefined {
  const entry = cache.get(key.id) as CacheEntry<T> | undefined;
  if (!entry || entry.value === undefined) return undefined;

  if (entry.expiresAt <= Date.now()) {
    cache.delete(key.id);
    return undefined;
  }

  return entry.value;
}

/**
 * Shares one in-flight read between consumers and retains a successful result
 * briefly for route remounts. A forced request replaces its entry first, so a
 * late response from the old request can neither re-populate the cache nor
 * overwrite a newer value.
 */
export function loadCachedData<T>(
  key: DataCacheKey,
  load: () => Promise<T>,
  { force = false, ttlMs = DEFAULT_TTL_MS }: CachedLoadOptions = {},
): Promise<T> {
  let entry = cache.get(key.id) as CacheEntry<T> | undefined;

  if (force && entry) {
    cache.delete(key.id);
    entry = undefined;
  }

  const cached = entry && entry.value !== undefined && entry.expiresAt > Date.now() ? entry.value : undefined;
  if (cached !== undefined) return Promise.resolve(cached);

  if (entry?.pending) return entry.pending;

  const nextEntry: CacheEntry<T> = { key, expiresAt: 0 };
  cache.set(key.id, nextEntry as CacheEntry<unknown>);

  let request: Promise<T>;
  try {
    request = Promise.resolve(load());
  } catch (error) {
    request = Promise.reject(error);
  }

  nextEntry.pending = request
    .then((value) => {
      // The identity check is the stale-response guard: invalidation/force
      // swaps the map entry, making this older response a no-op for the cache.
      if (cache.get(key.id) === nextEntry) {
        nextEntry.value = value;
        nextEntry.expiresAt = Date.now() + ttlMs;
      }
      return value;
    })
    .finally(() => {
      if (cache.get(key.id) === nextEntry) nextEntry.pending = undefined;
    });

  return nextEntry.pending;
}

/** Removes exactly the supplied responses, including protection from late writes. */
export function invalidateCachedData(...keys: DataCacheKey[]): void {
  for (const key of keys) cache.delete(key.id);
}

/** Invalidates all cached pages for the supplied private resources. */
export function invalidateCachedResources(scope: string | null, resources: readonly string[]): void {
  const normalizedScope = scope ?? 'anonymous';
  const resourceSet = new Set(resources);

  for (const [id, entry] of cache) {
    if (entry.key.scope === normalizedScope && resourceSet.has(entry.key.resource)) cache.delete(id);
  }
}

/** Used when the active token changes or is rejected. */
export function clearDataCache(): void {
  cache.clear();
}
