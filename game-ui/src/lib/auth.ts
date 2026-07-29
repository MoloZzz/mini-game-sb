import type { PlayerRole } from '@card-game/shared-types';

const TOKEN_KEY = 'auth_token';
const LOGOUT_EVENT = 'auth:logout';

export function getToken(): string | null {
  try {
    return window.localStorage.getItem(TOKEN_KEY);
  } catch {
    // Storage can be unavailable (private browsing, disabled cookies) —
    // treat that the same as "not logged in" rather than crashing.
    return null;
  }
}

export function setToken(token: string): void {
  try {
    window.localStorage.setItem(TOKEN_KEY, token);
  } catch {
    // best effort only — matches the guard AdminReview uses around its own
    // localStorage read/write
  }
}

export function clearToken(): void {
  try {
    window.localStorage.removeItem(TOKEN_KEY);
  } catch {
    // best effort only
  }
}

/**
 * A 401 response clears the token and fires this event (see `request()` in
 * `./api`); `AuthProvider` listens for it and drops its local session state.
 * Routed through `window` events — not a direct import of `authContext` —
 * so `api.ts` never has to import React or depend on the provider existing.
 */
export function dispatchLogout(): void {
  window.dispatchEvent(new Event(LOGOUT_EVENT));
}

export function onLogout(handler: () => void): () => void {
  window.addEventListener(LOGOUT_EVENT, handler);
  return () => window.removeEventListener(LOGOUT_EVENT, handler);
}

export interface JwtClaims {
  sub: string;
  role: PlayerRole;
  iat: number;
  exp: number;
}

function isJwtClaims(value: unknown): value is JwtClaims {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.sub === 'string' &&
    (record.role === 'player' || record.role === 'admin') &&
    typeof record.iat === 'number' &&
    typeof record.exp === 'number'
  );
}

/**
 * Decodes the payload segment of a JWT WITHOUT verifying its signature — no
 * JWT library involved, just base64url -> JSON.
 *
 * This exists purely for UI affordances (e.g. deciding whether to render the
 * admin nav link) and MUST NOT be treated as a security boundary. The server
 * re-verifies the token's signature and expiry on every protected request
 * and is the sole authority on what a token actually grants; a tampered,
 * forged, or expired token decoded here would still be rejected there.
 * Nothing downstream of this function should gate access to real data or
 * actions — only what gets rendered.
 */
export function decodeClaims(token: string): JwtClaims | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  try {
    const base64 = parts[1]!.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
    const binary = atob(padded);
    // atob yields a binary string (one byte per char); re-encode through
    // percent-escapes so multi-byte UTF-8 in the payload decodes correctly
    // instead of mangling into replacement characters.
    const json = decodeURIComponent(
      binary
        .split('')
        .map((char) => '%' + char.charCodeAt(0).toString(16).padStart(2, '0'))
        .join(''),
    );
    const parsed: unknown = JSON.parse(json);
    return isJwtClaims(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function isExpired(claims: JwtClaims): boolean {
  return claims.exp * 1000 <= Date.now();
}
