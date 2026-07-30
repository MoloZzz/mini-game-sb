import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import { resetDb } from '@/mocks/db';
import { server } from '@/mocks/server';
import { AuthProvider } from '@/lib/authContext';

import { AppShell } from '../AppShell';

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

/** Matches src/mocks/handlers.ts's mock-token shape, for the seeded mock-player-1 / mock-admin-1 accounts. */
function makeToken(sub: string, role: 'player' | 'admin'): string {
  const header = base64UrlEncode(JSON.stringify({ alg: 'none', typ: 'JWT' }));
  const now = Math.floor(Date.now() / 1000);
  const payload = base64UrlEncode(JSON.stringify({ sub, role, iat: now, exp: now + 7 * 24 * 60 * 60 }));
  return `${header}.${payload}.sig`;
}

function renderShellAs(role: 'player' | 'admin') {
  const sub = role === 'admin' ? 'mock-admin-1' : 'mock-player-1';
  window.localStorage.setItem('auth_token', makeToken(sub, role));

  return render(
    <MemoryRouter initialEntries={['/']}>
      <AuthProvider>
        <AppShell>
          <div>content</div>
        </AppShell>
      </AuthProvider>
    </MemoryRouter>,
  );
}

beforeAll(() => server.listen());
afterEach(() => {
  server.resetHandlers();
  resetDb();
  window.localStorage.clear();
});
afterAll(() => server.close());

beforeEach(() => stubMatchMedia());

describe('AppShell', () => {
  it('hides the Review nav item for a player role', async () => {
    renderShellAs('player');

    // Wait for AuthProvider's session restore (GET /auth/me) to settle so
    // the role is actually known before asserting its absence.
    await waitFor(() => expect(screen.getByText('Molo')).toBeInTheDocument());

    expect(screen.getByRole('link', { name: 'Play' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Inventory' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Review' })).not.toBeInTheDocument();
  });

  it('shows the Review nav item for an admin role', async () => {
    renderShellAs('admin');

    await waitFor(() => expect(screen.getByText('Admin')).toBeInTheDocument());

    expect(screen.getByRole('link', { name: 'Review' })).toBeInTheDocument();
  });

  it('shows a logout control naming the signed-in player once the session restores', async () => {
    renderShellAs('player');

    await waitFor(() => expect(screen.getByText('Molo')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /log out/i })).toBeInTheDocument();
  });

  it('keeps mobile navigation links in a dedicated horizontally scrollable strip', async () => {
    const { container } = renderShellAs('admin');

    await waitFor(() => expect(screen.getByText('Admin')).toBeInTheDocument());

    const nav = container.querySelector('nav');
    expect(nav).toHaveClass('flex-wrap');
    expect(nav?.querySelector('.overflow-x-auto')).toHaveClass('w-full', 'sm:w-auto');
  });
});
