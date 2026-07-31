import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { MemoryRouter } from 'react-router-dom';
import type { GenerationOrderDto } from '@card-game/shared-types';

import { db, resetDb } from '@/mocks/db';
import { server } from '@/mocks/server';

import { GenerationOrders, reconcileGenerationOrders } from '../GenerationOrders';

const ordersUrl = '*/api/admin/generation-orders';

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
beforeEach(() => resetDb());
afterEach(() => {
  server.resetHandlers();
  vi.restoreAllMocks();
  delete (document as { hidden?: boolean }).hidden;
});
afterAll(() => server.close());

function emptyPage() {
  return HttpResponse.json({ items: [], total: 0, page: 1, limit: 20 });
}

function renderOrders() {
  return render(
    <MemoryRouter>
      <GenerationOrders />
    </MemoryRouter>,
  );
}

/** Renders against an empty queue — for the cases that only exercise the form. */
function renderEmptyOrders() {
  server.use(http.get(ordersUrl, () => emptyPage()));
  return renderOrders();
}

describe('GenerationOrders', () => {
  it('keeps the existing list reference when a poll returns unchanged orders', () => {
    const previous: GenerationOrderDto[] = [{
      id: 'order-1',
      status: 'draft',
      title: 'Ashen beast',
      brief: 'A horned beast in ash',
      archetype: 'beast',
      element: 'fire',
      suggestedRarity: 'common',
      candidateCount: 4,
      setId: null,
      recipeProfile: 'card-v1',
      createdByPlayerId: 'admin-1',
      createdAt: '2026-07-30T00:00:00.000Z',
      readyAt: null,
      generatedAt: null,
      completedAt: null,
      failureCode: null,
      failureDetail: null,
      candidates: [],
    }];
    const equivalent = [{ ...previous[0]!, candidates: [] }];

    expect(reconcileGenerationOrders(previous, equivalent)).toBe(previous);
  });

  it('treats a changed candidate thumbnail as a changed order', () => {
    const base: GenerationOrderDto = {
      id: 'order-1', status: 'review', title: 'Ashen beast', brief: 'A horned beast in ash',
      archetype: 'beast', element: 'fire', suggestedRarity: 'common', candidateCount: 1, setId: null,
      recipeProfile: 'card-v1', createdByPlayerId: 'admin-1', createdAt: '2026-07-30T00:00:00.000Z',
      readyAt: null, generatedAt: null, completedAt: null, failureCode: null, failureDetail: null,
      candidates: [{
        id: 'c1', index: 1, slug: 'ashen-beast-1', seed: '7', status: 'generated',
        cardId: 'card-1', thumbUrl: '/a.svg', cardName: 'Ashen beast',
      }],
    };
    const withNewThumb: GenerationOrderDto = {
      ...base,
      candidates: [{ ...base.candidates[0]!, thumbUrl: '/b.svg' }],
    };

    expect(reconcileGenerationOrders([base], [withNewThumb])[0]).toBe(withNewThumb);
  });

  it('pauses polling while the document is hidden and resumes immediately when visible', async () => {
    let requestCount = 0;
    server.use(http.get(ordersUrl, () => {
      requestCount += 1;
      return emptyPage();
    }));
    const setIntervalSpy = vi.spyOn(window, 'setInterval');
    renderOrders();

    await waitFor(() => expect(requestCount).toBe(1));
    const poll = setIntervalSpy.mock.calls[0]?.[0] as (() => void) | undefined;
    expect(poll).toBeDefined();

    await act(async () => {
      poll?.();
    });
    await waitFor(() => expect(requestCount).toBe(2));

    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
      poll?.();
    });
    expect(requestCount).toBe(2);

    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await waitFor(() => expect(requestCount).toBe(3));
  });

  it('still loads once when mounted in a hidden tab', async () => {
    let requestCount = 0;
    server.use(http.get(ordersUrl, () => {
      requestCount += 1;
      return emptyPage();
    }));
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });

    renderOrders();

    // The fetch still happens; only the repeat poll waits for the tab to be
    // shown. Before this the queue sat on its skeletons indefinitely.
    await waitFor(() => expect(requestCount).toBe(1));
    expect(await screen.findByText(/No orders yet/)).toBeInTheDocument();
  });

  it('cleans up its polling interval when unmounted', async () => {
    const clearIntervalSpy = vi.spyOn(window, 'clearInterval');
    const { unmount } = renderEmptyOrders();

    await screen.findByLabelText('Title');
    unmount();

    expect(clearIntervalSpy).toHaveBeenCalled();
  });

  it('limits rarities to the selected archetype and normalizes an invalid selection', async () => {
    renderEmptyOrders();
    const user = userEvent.setup();
    let archetype = await screen.findByLabelText('Archetype');
    let rarity = screen.getByLabelText('Suggested rarity');

    await user.selectOptions(archetype, 'dragon');

    expect(rarity).toHaveValue('legendary');
    expect(Array.from((rarity as HTMLSelectElement).options, (option) => option.value)).toEqual(['legendary', 'mythic']);

    archetype = screen.getByLabelText('Archetype');
    await user.selectOptions(archetype, 'slime');
    rarity = screen.getByLabelText('Suggested rarity');
    expect(Array.from((rarity as HTMLSelectElement).options, (option) => option.value)).toEqual([
      'common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic',
    ]);
  });

  it('shows the API message when creating an order fails', async () => {
    renderEmptyOrders();
    server.use(http.post(ordersUrl, () => HttpResponse.json({
      code: 'GENERATION_CANDIDATE_MISMATCH', message: 'Dragon orders must be legendary or mythic.',
    }, { status: 400 })));
    const user = userEvent.setup();

    await screen.findByLabelText('Title');
    await user.type(screen.getByLabelText('Title'), 'Ancient dragon');
    await user.type(screen.getByLabelText('Visual brief'), 'A storm dragon over a ruined citadel');
    await user.click(screen.getByRole('button', { name: 'Create draft order' }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Dragon orders must be legendary or mythic.'));
  });

  it('explains an empty queue instead of rendering a blank list', async () => {
    renderEmptyOrders();

    expect(await screen.findByText(/No orders yet/)).toBeInTheDocument();
  });

  it('renders candidate thumbnails and statuses for an order awaiting review', async () => {
    renderOrders();

    const row = await screen.findByRole('article', { name: 'Verdant Harpy' });
    expect(within(row).getAllByRole('img')).toHaveLength(4);
    expect(within(row).getAllByText('generated')).toHaveLength(4);
  });

  it('shows both the failure code and its detail for a failed order', async () => {
    renderOrders();

    expect(await screen.findByText('FORGE_OUT_OF_MEMORY')).toBeInTheDocument();
    expect(screen.getByText(/CUDA out of memory at step 21\/28/)).toBeInTheDocument();
  });

  it('filters the queue by status', async () => {
    renderOrders();
    const user = userEvent.setup();

    await screen.findByText('Obsidian Leviathan');
    await user.click(screen.getByRole('button', { name: 'failed' }));

    await waitFor(() => expect(screen.queryByText('Ashen Serpent')).not.toBeInTheDocument());
    expect(screen.getByText('Obsidian Leviathan')).toBeInTheDocument();
  });

  it('queues a draft order and reflects the new status', async () => {
    renderOrders();
    const user = userEvent.setup();

    await screen.findByText('Ashen Serpent');
    await user.click(screen.getByRole('button', { name: 'Queue for Forge' }));

    await waitFor(() => expect(db.generationOrders.find((o) => o.id === 'mock-order-draft')?.status).toBe('ready'));
  });

  it('needs a confirmation click before cancelling, then closes the order', async () => {
    renderOrders();
    const user = userEvent.setup();

    const row = await screen.findByRole('article', { name: 'Gilded Wyrm' });
    await user.click(within(row).getByRole('button', { name: 'Cancel' }));

    expect(db.generationOrders.find((o) => o.id === 'mock-order-ready')?.status).toBe('ready');

    await user.click(within(row).getByRole('button', { name: 'Confirm cancel' }));
    await waitFor(() => expect(db.generationOrders.find((o) => o.id === 'mock-order-ready')?.status).toBe('cancelled'));
  });

  it('regenerates a reviewed order with a fresh candidate crop and rejects its old cards', async () => {
    renderOrders();
    const user = userEvent.setup();
    const oldCandidateIds = db.generationOrders.find((o) => o.id === 'mock-order-review')!.candidates.map((c) => c.id);
    const oldCardIds = db.generationOrders
      .find((o) => o.id === 'mock-order-review')!
      .candidates.map((c) => c.cardId!);

    const row = await screen.findByRole('article', { name: 'Verdant Harpy' });
    await user.click(within(row).getByRole('button', { name: 'Regenerate' }));

    await waitFor(() => {
      const order = db.generationOrders.find((o) => o.id === 'mock-order-review')!;
      expect(order.status).toBe('ready');
      expect(order.candidates.map((c) => c.id)).not.toEqual(oldCandidateIds);
    });
    for (const cardId of oldCardIds) {
      expect(db.adminCards.find((c) => c.id === cardId)?.status).toBe('rejected');
    }
  });

  it('opens the edit dialog for a draft order and saves a PATCH', async () => {
    renderOrders();
    const user = userEvent.setup();

    await screen.findByText('Ashen Serpent');
    await user.click(screen.getByRole('button', { name: 'Edit' }));

    const dialog = await screen.findByRole('dialog');
    const title = within(dialog).getByLabelText('Title');
    await user.clear(title);
    await user.type(title, 'Ashen Serpent MK2');
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }));

    await waitFor(() =>
      expect(db.generationOrders.find((o) => o.id === 'mock-order-draft')?.title).toBe('Ashen Serpent MK2'),
    );
  });

  it('disables an order’s actions while one of its requests is in flight', async () => {
    let release: (() => void) | undefined;
    server.use(http.post(`${ordersUrl}/:id/queue`, async () => {
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      return HttpResponse.json(db.generationOrders[0]);
    }));
    renderOrders();
    const user = userEvent.setup();

    await screen.findByText('Ashen Serpent');
    const queueButton = screen.getByRole('button', { name: 'Queue for Forge' });
    await user.click(queueButton);

    await waitFor(() => expect(queueButton).toBeDisabled());
    expect(screen.getByRole('button', { name: 'Edit' })).toBeDisabled();

    await act(async () => {
      release?.();
    });
  });
});
