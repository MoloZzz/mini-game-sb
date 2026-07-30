import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import type { CollectionCardsResponse } from '@card-game/shared-types';
import { MemoryRouter } from 'react-router-dom';

import { clearDataCache } from '@/lib/dataCache';
import { server } from '@/mocks/server';

import { CollectionPage } from '../CollectionPage';

const collectionCardsUrl = '*/api/me/collection/cards';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function collectionPage(page: number, name: string, rarity: 'common' | 'legendary' = 'common'): CollectionCardsResponse {
  const id = `card-page-${page}-${rarity}`;
  return {
    items: [
      {
        id,
        rarity,
        owned: true,
        card: {
          id,
          slug: id,
          name,
          rarity,
          element: rarity === 'legendary' ? 'fire' : 'water',
          archetype: rarity === 'legendary' ? 'dragon' : 'beast',
          attack: 10,
          defense: 8,
          flavorText: null,
          thumbUrl: `/mock/thumbs/${id}.svg`,
          imageUrl: `/mock/art/${id}.svg`,
        },
      },
    ],
    total: 60,
    page,
    limit: 30,
  };
}

beforeAll(() => server.listen());
beforeEach(() => clearDataCache());
afterEach(() => {
  server.resetHandlers();
  clearDataCache();
});
afterAll(() => server.close());

describe('CollectionPage', () => {
  it('keeps the resolved grid visible, then atomically swaps to the prefetched next page', async () => {
    const nextPage = deferred();
    let nextPageRequests = 0;

    server.use(
      http.get(collectionCardsUrl, async ({ request }) => {
        const page = Number(new URL(request.url).searchParams.get('page') ?? '1');
        if (page === 2) {
          nextPageRequests += 1;
          await nextPage.promise;
          return HttpResponse.json(collectionPage(2, 'Page two card'));
        }
        return HttpResponse.json(collectionPage(1, 'Page one card'));
      }),
    );

    const user = userEvent.setup();
    render(<MemoryRouter><CollectionPage /></MemoryRouter>);

    await screen.findByText('Page one card');
    // A successful page 1 response warms page 2 before the player asks for it.
    await waitFor(() => expect(nextPageRequests).toBe(1));

    await user.click(screen.getByRole('button', { name: 'Next' }));

    expect(screen.getByText('Page one card')).toBeInTheDocument();
    expect(screen.getByTestId('collection-refreshing')).toHaveTextContent(
      'Loading page 2… Showing page 1 until it is ready.',
    );
    expect(nextPageRequests).toBe(1);
    expect(screen.queryByText('Page two card')).not.toBeInTheDocument();

    nextPage.resolve();

    await screen.findByText('Page two card');
    expect(screen.queryByText('Page one card')).not.toBeInTheDocument();
    expect(screen.queryByTestId('collection-refreshing')).not.toBeInTheDocument();
  });

  it('keeps the old cards visible while a filter result is loading', async () => {
    const filteredPage = deferred();

    server.use(
      http.get(collectionCardsUrl, async ({ request }) => {
        const params = new URL(request.url).searchParams;
        if (params.get('rarity') === 'legendary') {
          await filteredPage.promise;
          return HttpResponse.json(collectionPage(1, 'Legendary result', 'legendary'));
        }
        return HttpResponse.json(collectionPage(1, 'Unfiltered result'));
      }),
    );

    const user = userEvent.setup();
    render(<MemoryRouter><CollectionPage /></MemoryRouter>);

    await screen.findByText('Unfiltered result');
    await user.click(screen.getByRole('button', { name: 'legendary' }));

    expect(screen.getByText('Unfiltered result')).toBeInTheDocument();
    expect(screen.getByTestId('collection-refreshing')).toHaveTextContent('Refreshing collection…');
    expect(screen.queryByText('Legendary result')).not.toBeInTheDocument();

    filteredPage.resolve();

    await screen.findByText('Legendary result');
    expect(screen.queryByText('Unfiltered result')).not.toBeInTheDocument();
  });
});
