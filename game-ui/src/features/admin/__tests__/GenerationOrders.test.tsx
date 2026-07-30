import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import type { GenerationOrderDto } from '@card-game/shared-types';

import { server } from '@/mocks/server';

import { GenerationOrders, reconcileGenerationOrders } from '../GenerationOrders';

const ordersUrl = '*/api/admin/generation-orders';

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  vi.restoreAllMocks();
  delete (document as { hidden?: boolean }).hidden;
});
afterAll(() => server.close());

function renderOrders() {
  server.use(http.get(ordersUrl, () => HttpResponse.json([])));
  return render(<GenerationOrders />);
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
      candidates: [],
    }];
    const equivalent = [{ ...previous[0]!, candidates: [] }];

    expect(reconcileGenerationOrders(previous, equivalent)).toBe(previous);
  });

  it('pauses polling while the document is hidden and resumes immediately when visible', async () => {
    let requestCount = 0;
    server.use(http.get(ordersUrl, () => {
      requestCount += 1;
      return HttpResponse.json([]);
    }));
    const setIntervalSpy = vi.spyOn(window, 'setInterval');
    render(<GenerationOrders />);

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

  it('cleans up its polling interval when unmounted', async () => {
    const clearIntervalSpy = vi.spyOn(window, 'clearInterval');
    const { unmount } = renderOrders();

    await screen.findByLabelText('Title');
    unmount();

    expect(clearIntervalSpy).toHaveBeenCalled();
  });

  it('limits rarities to the selected archetype and normalizes an invalid selection', async () => {
    renderOrders();
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
    renderOrders();
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
});
