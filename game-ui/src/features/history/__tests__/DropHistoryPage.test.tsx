import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';

import { clearDataCache } from '@/lib/dataCache';
import { db, resetDb } from '@/mocks/db';
import { server } from '@/mocks/server';

import { DropHistoryPage } from '../DropHistoryPage';

beforeAll(() => server.listen());
afterEach(() => {
  server.resetHandlers();
  resetDb();
  clearDataCache();
});
afterAll(() => server.close());

describe('DropHistoryPage', () => {
  it('lists every seeded drop, newest first', async () => {
    render(<DropHistoryPage />);

    const newest = db.drops[0]!;
    await waitFor(() => expect(screen.getByText(newest.card.name)).toBeInTheDocument());

    for (const drop of db.drops) {
      expect(screen.getByText(drop.card.name)).toBeInTheDocument();
    }

    // The seed spans 3h to 72h ago, so the first day section is Today and it
    // holds the newest drop.
    const today = screen.getByRole('region', { name: 'Today' });
    expect(within(today).getByText(newest.card.name)).toBeInTheDocument();
  });

  it('shows the empty state when the player has never opened a case', async () => {
    db.drops.length = 0;

    render(<DropHistoryPage />);

    await waitFor(() => expect(screen.getByText(/no drops yet/i)).toBeInTheDocument());
  });
});
