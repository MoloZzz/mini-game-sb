import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { http, HttpResponse } from 'msw';

import { resetDb } from '@/mocks/db';
import { server } from '@/mocks/server';

import { getMe, openCase } from '../api';
import { getToken, onLogout, setToken } from '../auth';
import {
  clearDataCache,
  createDataCacheKey,
  DATA_CACHE_RESOURCES,
  getCachedData,
  loadCachedData,
} from '../dataCache';

beforeAll(() => server.listen());
afterEach(() => {
  server.resetHandlers();
  resetDb();
  clearDataCache();
  window.localStorage.clear();
});
afterAll(() => server.close());

describe('request()', () => {
  it('attaches the Authorization header when a token is present', async () => {
    setToken('good-token');
    let seenAuth: string | null = null;
    server.use(
      http.get('*/api/me', ({ request }) => {
        seenAuth = request.headers.get('authorization');
        return HttpResponse.json({
          id: 'p1',
          displayName: 'Test',
          balance: { coins: 0, keys: 0 },
          stats: { casesOpened: 0, uniqueCards: 0, totalCards: 0 },
          dailyBonusAvailableAt: null,
          pityCounter: 0,
        });
      }),
    );

    await getMe();
    expect(seenAuth).toBe('Bearer good-token');
  });

  it('sends no Authorization header when there is no stored token', async () => {
    let seenAuth: string | null = 'unset';
    server.use(
      http.get('*/api/me', ({ request }) => {
        seenAuth = request.headers.get('authorization');
        return HttpResponse.json({
          id: 'p1',
          displayName: 'Test',
          balance: { coins: 0, keys: 0 },
          stats: { casesOpened: 0, uniqueCards: 0, totalCards: 0 },
          dailyBonusAvailableAt: null,
          pityCounter: 0,
        });
      }),
    );

    await getMe();
    expect(seenAuth).toBeNull();
  });

  it('on a 401, clears the stored token and fires auth:logout exactly once, without retrying the request itself', async () => {
    setToken('stale-token');

    let callCount = 0;
    server.use(
      http.get('*/api/me', () => {
        callCount++;
        return HttpResponse.json(
          { code: 'UNAUTHORIZED', message: 'Invalid or expired token' },
          { status: 401 },
        );
      }),
    );

    const logoutHandler = vi.fn();
    const unsubscribe = onLogout(logoutHandler);

    await expect(getMe()).rejects.toMatchObject({ status: 401, code: 'UNAUTHORIZED' });

    expect(getToken()).toBeNull();
    expect(logoutHandler).toHaveBeenCalledTimes(1);
    // The whole point: request() itself never issues a second call in
    // reaction to the 401 — if it did, a stale token would trigger 401 after
    // 401 forever instead of landing on the login screen once.
    expect(callCount).toBe(1);

    unsubscribe();
  });

  it('a non-401 error leaves the stored token untouched', async () => {
    setToken('still-good');
    server.use(
      http.get('*/api/me', () =>
        HttpResponse.json({ code: 'UNKNOWN', message: 'Server exploded' }, { status: 500 }),
      ),
    );

    await expect(getMe()).rejects.toMatchObject({ status: 500 });
    expect(getToken()).toBe('still-good');
  });
});

describe('openCase cache invalidation', () => {
  it('drops all ownership-dependent reads only after a successful opening', async () => {
    const token = 'cache-owner';
    setToken(token);
    const resources = [
      DATA_CACHE_RESOURCES.authMe,
      DATA_CACHE_RESOURCES.player,
      DATA_CACHE_RESOURCES.drops,
      DATA_CACHE_RESOURCES.inventory,
      DATA_CACHE_RESOURCES.collectionProgress,
      DATA_CACHE_RESOURCES.collectionCards,
      DATA_CACHE_RESOURCES.collectionGoal,
    ];
    const keys = resources.map((resource) => createDataCacheKey(token, resource));

    await Promise.all(keys.map((key, index) => loadCachedData(key, async () => index)));
    expect(keys.map((key) => getCachedData(key))).toEqual([0, 1, 2, 3, 4, 5, 6]);

    await openCase('starter-chest');

    expect(keys.map((key) => getCachedData(key))).toEqual([undefined, undefined, undefined, undefined, undefined, undefined, undefined]);
  });
});
