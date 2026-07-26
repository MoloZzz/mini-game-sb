import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { db, resetDb } from '@/mocks/db';
import { server } from '@/mocks/server';

import { Inventory } from '../Inventory';

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

beforeAll(() => server.listen());
afterEach(() => {
  server.resetHandlers();
  resetDb();
});
afterAll(() => server.close());

beforeEach(() => {
  stubMatchMedia();
});

describe('Inventory', () => {
  it('renders grouped tiles from the seeded mock inventory', async () => {
    render(<Inventory />);

    // Seeded in src/mocks/db.ts: mock-common-1 (×3), mock-common-2 (×2),
    // mock-uncommon-1 (×2), mock-rare-1, mock-epic-1, mock-legendary-1.
    await waitFor(() => expect(screen.getByText('Bog Rat')).toBeInTheDocument());
    expect(screen.getByText('Ash Sprite')).toBeInTheDocument();
    expect(screen.getByText('Thorn Wolf')).toBeInTheDocument();
    expect(screen.getByText('Storm Falcon')).toBeInTheDocument();
    expect(screen.getByText('Void Wraith')).toBeInTheDocument();
    expect(screen.getByText('Ember Drake')).toBeInTheDocument();
  });

  it('shows a ×3 badge for the card seeded with three copies', async () => {
    render(<Inventory />);

    await waitFor(() => expect(screen.getByText('Bog Rat')).toBeInTheDocument());
    expect(screen.getByText('×3')).toBeInTheDocument();
    // Two cards are seeded with 2 copies (mock-common-2, mock-uncommon-1).
    expect(screen.getAllByText('×2')).toHaveLength(2);
  });

  it('selecting a card opens the detail view', async () => {
    const user = userEvent.setup();
    render(<Inventory />);

    await waitFor(() => expect(screen.getByText('Bog Rat')).toBeInTheDocument());
    await user.click(screen.getByText('Bog Rat'));

    await waitFor(() => expect(screen.getByText('Copies owned: 3')).toBeInTheDocument());
  });

  it('shows the empty state when the player owns no cards', async () => {
    db.ownedInstances = [];

    render(<Inventory />);

    await waitFor(() => expect(screen.getByText(/no cards yet/i)).toBeInTheDocument());
  });
});
