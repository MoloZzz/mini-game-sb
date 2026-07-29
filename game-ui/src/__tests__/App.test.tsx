import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';

import { resetDb } from '@/mocks/db';
import { server } from '@/mocks/server';

import App from '../App';

// jsdom doesn't implement matchMedia; some shared/lib code paths probe it.
function stubMatchMedia() {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

function base64UrlEncode(input: string): string {
  return btoa(input).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Shaped like the real token: base64url header.payload.signature (see src/mocks/handlers.ts). */
function makeToken(sub: string, role: 'player' | 'admin'): string {
  const header = base64UrlEncode(JSON.stringify({ alg: 'none', typ: 'JWT' }));
  const now = Math.floor(Date.now() / 1000);
  const payload = base64UrlEncode(JSON.stringify({ sub, role, iat: now, exp: now + 7 * 24 * 60 * 60 }));
  return `${header}.${payload}.sig`;
}

beforeAll(() => server.listen());
afterEach(() => {
  server.resetHandlers();
  resetDb();
  window.localStorage.clear();
});
afterAll(() => server.close());

beforeEach(() => {
  stubMatchMedia();
  // BrowserRouter reads the live jsdom location, which otherwise carries
  // over navigation from a previous test in this file.
  window.history.pushState({}, '', '/');
});

describe('App', () => {
  it('sends an unauthenticated visitor to /login instead of the lobby', async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByRole('heading', { name: /sign in/i })).toBeInTheDocument());
  });

  it('logging in with a valid account reaches the lobby', async () => {
    render(<App />);
    await screen.findByRole('heading', { name: /sign in/i });

    // Seeded in src/mocks/db.ts specifically so mock mode is usable without
    // a registration round-trip first.
    await userEvent.type(screen.getByLabelText(/email/i), 'player@example.com');
    await userEvent.type(screen.getByLabelText(/password/i), 'password123');
    await userEvent.click(screen.getByRole('button', { name: /^sign in$/i }));

    await waitFor(() => expect(screen.getByText('Card Game')).toBeInTheDocument());
  });

  it('a 401 while loading protected data clears the session and lands back on /login without looping', async () => {
    // A previously-issued, still-well-formed token — the loop this guards
    // against is exactly this case: a token the client trusts but the
    // server has stopped honouring (expired/revoked).
    window.localStorage.setItem('auth_token', makeToken('mock-player-1', 'player'));

    let meCalls = 0;
    server.use(
      http.get('*/api/me', () => {
        meCalls++;
        return HttpResponse.json(
          { code: 'UNAUTHORIZED', message: 'Invalid or expired token' },
          { status: 401 },
        );
      }),
    );

    render(<App />);

    // The lobby's GET /me (distinct from GET /auth/me, which is unaffected
    // and still succeeds on mount) fails with 401, which clears the token
    // and fires the logout event — RequireAuth then redirects.
    await waitFor(() => expect(screen.getByRole('heading', { name: /sign in/i })).toBeInTheDocument());

    // If request() retried after clearing the token, this would keep
    // climbing instead of settling at 1.
    expect(meCalls).toBe(1);
    expect(window.localStorage.getItem('auth_token')).toBeNull();
  });
});
