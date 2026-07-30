import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';

import { server } from '@/mocks/server';

import { GenerationOrders } from '../GenerationOrders';

const ordersUrl = '*/api/admin/generation-orders';

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function renderOrders() {
  server.use(http.get(ordersUrl, () => HttpResponse.json([])));
  return render(<GenerationOrders />);
}

describe('GenerationOrders', () => {
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
