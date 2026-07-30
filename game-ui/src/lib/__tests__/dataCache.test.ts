import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  clearDataCache,
  createDataCacheKey,
  getCachedData,
  invalidateCachedResources,
  loadCachedData,
} from '../dataCache';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((finish) => {
    resolve = finish;
  });
  return { promise, resolve };
}

afterEach(() => {
  clearDataCache();
  vi.restoreAllMocks();
});

describe('data cache', () => {
  it('shares concurrent reads and serves the fresh result to a remounted consumer', async () => {
    const key = createDataCacheKey('session-a', 'inventory', 'page=1');
    const pending = deferred<number>();
    const load = vi.fn(() => pending.promise);

    const first = loadCachedData(key, load);
    const second = loadCachedData(key, load);

    expect(load).toHaveBeenCalledTimes(1);

    pending.resolve(7);
    await expect(first).resolves.toBe(7);
    await expect(second).resolves.toBe(7);
    await expect(loadCachedData(key, load)).resolves.toBe(7);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('never lets a superseded request replace the newer cached value', async () => {
    const key = createDataCacheKey('session-a', 'player');
    const older = deferred<string>();
    const newer = deferred<string>();

    const first = loadCachedData(key, () => older.promise);
    const forced = loadCachedData(key, () => newer.promise, { force: true });

    newer.resolve('new');
    await expect(forced).resolves.toBe('new');
    older.resolve('old');
    await expect(first).resolves.toBe('old');

    expect(getCachedData(key)).toBe('new');
  });

  it('expires entries and can invalidate every cached page for one resource', async () => {
    let now = 1_000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    const pageOne = createDataCacheKey('session-a', 'inventory', 'page=1');
    const pageTwo = createDataCacheKey('session-a', 'inventory', 'page=2');
    const progress = createDataCacheKey('session-a', 'collection-progress');
    const otherSession = createDataCacheKey('session-b', 'inventory', 'page=1');

    await loadCachedData(pageOne, async () => 1, { ttlMs: 10 });
    await loadCachedData(pageTwo, async () => 2, { ttlMs: 10 });
    await loadCachedData(progress, async () => 3, { ttlMs: 10 });
    await loadCachedData(otherSession, async () => 4, { ttlMs: 10 });

    invalidateCachedResources('session-a', ['inventory']);
    expect(getCachedData(pageOne)).toBeUndefined();
    expect(getCachedData(pageTwo)).toBeUndefined();
    expect(getCachedData(progress)).toBe(3);
    expect(getCachedData(otherSession)).toBe(4);

    now += 10;
    expect(getCachedData(progress)).toBeUndefined();
  });
});
