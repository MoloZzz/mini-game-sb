import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { CASE_SEEDS } from '@card-game/shared-types';

import { db, resetDb } from '@/mocks/db';
import { server } from '@/mocks/server';

import { Lobby } from '../Lobby';

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

beforeAll(() => server.listen());
afterEach(() => {
  server.resetHandlers();
  resetDb();
});
afterAll(() => server.close());

beforeEach(() => {
  stubMatchMedia();
});

const STARTER_INDEX = CASE_SEEDS.findIndex((c) => c.slug === 'starter-chest');

describe('Lobby', () => {
  it('renders a case card for every seed case', async () => {
    render(<Lobby onOpenCase={() => {}} />);

    for (const seed of CASE_SEEDS) {
      await waitFor(() => expect(screen.getByText(seed.name)).toBeInTheDocument());
    }
  });

  it('clicking a case shows its odds table', async () => {
    const user = userEvent.setup();
    render(<Lobby onOpenCase={() => {}} />);

    const starter = CASE_SEEDS[STARTER_INDEX]!;
    await waitFor(() => expect(screen.getByText(starter.name)).toBeInTheDocument());

    await user.click(screen.getByText(starter.name));

    // OddsTable renders every rarity as a row label — mythic is the
    // rarest/most distinctive to assert on, plus its known "1 in 500" odds.
    await waitFor(() => expect(screen.getByText(/^mythic$/i)).toBeInTheDocument());
    expect(screen.getByText(/1 in 500/)).toBeInTheDocument();
  });

  it('clicking Open calls onOpenCase with the right slug', async () => {
    const user = userEvent.setup();
    const onOpenCase = vi.fn();
    render(<Lobby onOpenCase={onOpenCase} />);

    await waitFor(() => expect(screen.getAllByRole('button', { name: /^open$/i })).toHaveLength(CASE_SEEDS.length));

    const openButtons = screen.getAllByRole('button', { name: /^open$/i });
    await user.click(openButtons[STARTER_INDEX]!);

    expect(onOpenCase).toHaveBeenCalledWith('starter-chest');
  });

  it('disables the Open button for a case the player cannot afford', async () => {
    db.balance.coins = 0;
    db.balance.keys = 0;

    render(<Lobby onOpenCase={() => {}} />);

    await waitFor(() => expect(screen.getAllByRole('button', { name: /^open$/i })).toHaveLength(CASE_SEEDS.length));

    const openButtons = screen.getAllByRole('button', { name: /^open$/i });
    for (const button of openButtons) {
      expect(button).toBeDisabled();
    }
  });

  it('renders every seed case at once', async () => {
    render(<Lobby onOpenCase={() => {}} />);

    await waitFor(() => expect(screen.getAllByTestId('case-card')).toHaveLength(CASE_SEEDS.length));
  });

  it('themes every element case with its element label, and the two element:null cases as Classic', async () => {
    render(<Lobby onOpenCase={() => {}} />);

    let tiles: HTMLElement[] = [];
    await waitFor(() => {
      tiles = screen.getAllByTestId('case-card');
      expect(tiles).toHaveLength(CASE_SEEDS.length);
    });

    for (const seed of CASE_SEEDS) {
      const tile = tiles.find((t) => t.getAttribute('data-case-slug') === seed.slug);
      expect(tile).toBeDefined();
      if (seed.element === null) {
        expect(tile).toHaveTextContent(/classic/i);
      } else {
        expect(tile).toHaveTextContent(new RegExp(seed.element, 'i'));
      }
    }
  });
});
