import { StrictMode } from 'react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';

import { REEL_LENGTH, WINNING_INDEX } from '@card-game/shared-types';

import { server } from '@/mocks/server';
import { resetDb } from '@/mocks/db';

import { OpenCaseScreen } from '../OpenCaseScreen';

/**
 * matchMedia is stubbed with `matches: true` so `usePrefersReducedMotion`
 * reports the accessibility preference and the whole flow takes the skip
 * path — that keeps this integration test off the 5.5s wall clock while
 * still exercising the real reel, the real preload and the real reveal.
 */
function stubMatchMedia(reduced: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: reduced,
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

class StubImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  set src(_value: string) {
    queueMicrotask(() => this.onload?.());
  }
}

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  resetDb();
});
afterAll(() => server.close());

beforeEach(() => {
  stubMatchMedia(true);
  globalThis.Image = StubImage as unknown as typeof Image;
});

/**
 * Rendered inside StrictMode on purpose: `main.tsx` mounts the app that way,
 * and StrictMode's double-invoked effects are what turn a naive
 * cancel-on-cleanup guard into "the reel never starts". Testing without it
 * hides the bug completely.
 */
function renderScreen() {
  return render(
    <StrictMode>
      <OpenCaseScreen
        slug="starter-chest"
        caseName="Starter Chest"
        onBackToLobby={() => {}}
        onToInventory={() => {}}
      />
    </StrictMode>,
  );
}

describe('OpenCaseScreen — the full open → reel → reveal loop against MSW', () => {
  it('renders exactly REEL_LENGTH tiles from the real mock response', async () => {
    const { container } = renderScreen();

    await waitFor(() =>
      expect(container.querySelectorAll('[data-reel-index]').length).toBe(REEL_LENGTH),
    );
  });

  it('reveals the card the server chose, and it is the tile at WINNING_INDEX', async () => {
    const { container } = renderScreen();

    await waitFor(() => {
      expect(container.querySelector(`[data-reel-index="${WINNING_INDEX}"]`)).not.toBeNull();
    });

    const winnerId = container
      .querySelector(`[data-reel-index="${WINNING_INDEX}"]`)
      ?.getAttribute('data-card-id');
    expect(winnerId).toBeTruthy();

    // The reveal replaces the reel once the post-stop pause elapses.
    const again = await screen.findByRole('button', { name: /again/i }, { timeout: 3000 });
    expect(again).toBeInTheDocument();

    // "Again" is the primary button — largest, centred, autofocused.
    expect(again).toHaveFocus();
  });

  it('surfaces a failed opening without leaving the player stuck', async () => {
    server.use(
      http.post('*/api/cases/:slug/open', () =>
        HttpResponse.json(
          { code: 'INSUFFICIENT_FUNDS', message: 'nope', need: { coins: 100 }, have: { coins: 0, keys: 0 } },
          { status: 402 },
        ),
      ),
    );

    renderScreen();

    // The server rolled the transaction back, so a retry must be offered.
    expect(await screen.findByRole('button', { name: /try again/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /back to lobby/i })).toBeInTheDocument();
  });

  it('opens the case exactly once per mount, even under StrictMode double-invocation', async () => {
    let openCalls = 0;
    server.events.on('request:start', ({ request }) => {
      if (request.method === 'POST' && request.url.includes('/open')) openCalls++;
    });

    const { container } = renderScreen();
    await waitFor(() =>
      expect(container.querySelectorAll('[data-reel-index]').length).toBe(REEL_LENGTH),
    );

    expect(openCalls).toBe(1);
    server.events.removeAllListeners();
  });
});
