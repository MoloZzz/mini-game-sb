import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { http, HttpResponse } from 'msw';

import { resetDb } from '@/mocks/db';
import { server } from '@/mocks/server';

import { getMe } from '../api';
import { getToken, onLogout, setToken } from '../auth';

beforeAll(() => server.listen());
afterEach(() => {
  server.resetHandlers();
  resetDb();
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
