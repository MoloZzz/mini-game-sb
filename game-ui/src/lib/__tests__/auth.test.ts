import { afterEach, describe, expect, it, vi } from 'vitest';

import { clearToken, decodeClaims, getToken, isExpired, onLogout, setToken } from '../auth';

function base64UrlEncode(input: string): string {
  return btoa(input).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function makeToken(payload: Record<string, unknown>): string {
  const header = base64UrlEncode(JSON.stringify({ alg: 'none', typ: 'JWT' }));
  const body = base64UrlEncode(JSON.stringify(payload));
  return `${header}.${body}.signature`;
}

afterEach(() => {
  window.localStorage.clear();
});

describe('token storage', () => {
  it('round-trips through localStorage', () => {
    expect(getToken()).toBeNull();
    setToken('abc.def.ghi');
    expect(getToken()).toBe('abc.def.ghi');
    clearToken();
    expect(getToken()).toBeNull();
  });
});

describe('decodeClaims', () => {
  it('decodes a well-formed token payload', () => {
    const token = makeToken({ sub: 'player-1', role: 'admin', iat: 1000, exp: 2000 });
    expect(decodeClaims(token)).toEqual({ sub: 'player-1', role: 'admin', iat: 1000, exp: 2000 });
  });

  it('returns null for a token missing a required claim', () => {
    const token = makeToken({ sub: 'player-1', role: 'admin' });
    expect(decodeClaims(token)).toBeNull();
  });

  it('returns null for a token with an invalid role', () => {
    const token = makeToken({ sub: 'player-1', role: 'superuser', iat: 1000, exp: 2000 });
    expect(decodeClaims(token)).toBeNull();
  });

  it('returns null for garbage input rather than throwing', () => {
    expect(decodeClaims('not-a-jwt')).toBeNull();
    expect(decodeClaims('a.b')).toBeNull();
    expect(decodeClaims('')).toBeNull();
  });
});

describe('isExpired', () => {
  it('treats a past exp as expired and a future exp as not', () => {
    const nowSeconds = Math.floor(Date.now() / 1000);
    expect(isExpired({ sub: 'p', role: 'player', iat: nowSeconds - 10, exp: nowSeconds - 1 })).toBe(true);
    expect(isExpired({ sub: 'p', role: 'player', iat: nowSeconds, exp: nowSeconds + 10_000 })).toBe(false);
  });
});

describe('logout event', () => {
  it('notifies listeners and can be unsubscribed', async () => {
    const handler = vi.fn();
    const unsubscribe = onLogout(handler);

    const { dispatchLogout } = await import('../auth');
    dispatchLogout();
    expect(handler).toHaveBeenCalledTimes(1);

    unsubscribe();
    dispatchLogout();
    expect(handler).toHaveBeenCalledTimes(1);
  });
});
