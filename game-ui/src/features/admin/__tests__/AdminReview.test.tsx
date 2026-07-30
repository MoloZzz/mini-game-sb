import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, http, HttpResponse } from 'msw';
import { ARCHETYPE_RARITIES } from '@card-game/shared-types';

import { db, resetDb } from '@/mocks/db';
import { server } from '@/mocks/server';

import { AdminReview } from '../AdminReview';

// jsdom doesn't implement matchMedia.
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
  // Seed the cheat sheet as "already seen" so the first-visit overlay
  // doesn't dominate every test's DOM snapshot — its own behaviour isn't
  // part of what this suite is asked to verify.
  window.localStorage.setItem('admin-review-cheatsheet-seen', '1');
});

describe('AdminReview', () => {
  it('renders the seeded draft cards', async () => {
    render(<AdminReview />);

    await screen.findByText('Feral Serpent');
    expect(screen.getByText('Feral Golem')).toBeInTheDocument();
    const focusedCard = db.adminCards.find((card) => card.name === 'Feral Serpent');
    expect(
      screen.getAllByAltText('Feral Serpent').some((image) => image.getAttribute('src') === focusedCard?.imageUrl),
    ).toBe(true);

    const tiles = screen.getAllByTestId(/^admin-tile-/);
    expect(tiles.length).toBe(24);

    await waitFor(() => {
      expect(screen.getByTestId('review-progress')).toHaveTextContent('0 / 24 reviewed');
    });
  });

  it('opens the focused card artwork in a centered large dialog', async () => {
    const user = userEvent.setup();
    render(<AdminReview />);

    await screen.findByRole('button', { name: /view full size/i });
    await user.click(screen.getByRole('button', { name: /view full size/i }));

    expect(screen.getByRole('dialog', { name: /feral serpent full-size artwork/i })).toHaveClass('max-w-2xl');
  });

  it('pressing A approves the focused card and advances focus to the next one', async () => {
    render(<AdminReview />);
    await screen.findByTestId('admin-tile-draft-1');

    // Exactly one card is focused at a time; the first loaded card starts focused.
    //
    // This has to be a waitFor, not a bare assertion. `findByTestId` above
    // resolves on the render where the tile first exists, but focus is assigned
    // by an effect that runs after the cards land — so there is a real window in
    // which the tile is present with data-focused="false". In isolation the
    // window is too small to observe; under the full suite it widens enough to
    // fail intermittently.
    await waitFor(() => {
      expect(screen.getByTestId('admin-tile-draft-1')).toHaveAttribute('data-focused', 'true');
    });

    await userEvent.keyboard('a');

    await waitFor(() => {
      expect(screen.getByTestId('admin-tile-draft-1')).toHaveAttribute('data-status', 'approved');
    });
    await waitFor(() => {
      expect(screen.getByTestId('admin-tile-draft-2')).toHaveAttribute('data-focused', 'true');
    });
    expect(screen.getByTestId('admin-tile-draft-1')).toHaveAttribute('data-focused', 'false');
  });

  it('pressing arrow keys moves focus without changing status', async () => {
    render(<AdminReview />);
    await screen.findByTestId('admin-tile-draft-1');

    await userEvent.keyboard('{ArrowRight}');

    await waitFor(() => {
      expect(screen.getByTestId('admin-tile-draft-2')).toHaveAttribute('data-focused', 'true');
    });
    expect(screen.getByTestId('admin-tile-draft-1')).toHaveAttribute('data-status', 'draft');
    expect(screen.getByTestId('admin-tile-draft-2')).toHaveAttribute('data-status', 'draft');

    await userEvent.keyboard('{ArrowLeft}');

    await waitFor(() => {
      expect(screen.getByTestId('admin-tile-draft-1')).toHaveAttribute('data-focused', 'true');
    });
    expect(screen.getByTestId('admin-tile-draft-1')).toHaveAttribute('data-status', 'draft');
  });

  it('rolls back the optimistic update and surfaces an error when the PATCH fails', async () => {
    server.use(
      // The optimistic update and its rollback are both asserted below; a
      // real (zero-delay) rejection can settle before the first `waitFor`
      // ever observes the transient "approved" state, making the assertion
      // flaky. A short artificial delay gives the optimistic phase a
      // deterministic window to be observed before the rollback lands.
      http.patch('*/api/admin/cards/:id', async () => {
        await delay(30);
        return HttpResponse.json({ code: 'UNKNOWN', message: 'Server exploded' }, { status: 500 });
      }),
    );

    render(<AdminReview />);
    await screen.findByTestId('admin-tile-draft-1');

    await userEvent.keyboard('a');

    // Optimistic update lands immediately...
    await waitFor(() => {
      expect(screen.getByTestId('admin-tile-draft-1')).toHaveAttribute('data-status', 'approved');
    });

    // ...then rolls back once the failing PATCH resolves, with an error surfaced.
    await waitFor(() => {
      expect(screen.getByTestId('admin-tile-draft-1')).toHaveAttribute('data-status', 'draft');
    });
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
  });

  // The seeded 24-card draft pool cycles rarity and archetype independently
  // (db.ts), so it's guaranteed to contain both an allowed and a disallowed
  // combination — found from the live seed data rather than hardcoded card
  // names, so this keeps working if the seed generator ever changes.
  it('flags a card whose archetype/rarity combo the collection is not meant to hold, and not one that is fine', async () => {
    const mismatched = db.adminCards.find(
      (c) => !(ARCHETYPE_RARITIES[c.archetype] as readonly string[]).includes(c.rarity),
    );
    const matched = db.adminCards.find((c) =>
      (ARCHETYPE_RARITIES[c.archetype] as readonly string[]).includes(c.rarity),
    );
    expect(mismatched).toBeDefined();
    expect(matched).toBeDefined();

    render(<AdminReview />);
    await screen.findByTestId(`admin-tile-${mismatched!.id}`);

    await userEvent.click(screen.getByTestId(`admin-tile-${mismatched!.id}`));
    await waitFor(() => {
      expect(
        screen.getByText(`${mismatched!.archetype} cards are only ever ${ARCHETYPE_RARITIES[mismatched!.archetype].join('/')}.`),
      ).toBeInTheDocument();
    });

    await userEvent.click(screen.getByTestId(`admin-tile-${matched!.id}`));
    await waitFor(() => {
      expect(screen.getByTestId(`admin-tile-${matched!.id}`)).toHaveAttribute('data-focused', 'true');
    });
    expect(
      screen.queryByText(`${matched!.archetype} cards are only ever ${ARCHETYPE_RARITIES[matched!.archetype].join('/')}.`),
    ).not.toBeInTheDocument();
  });
});
