import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CASE_SEEDS, type CaseDto } from '@card-game/shared-types';

import { ExpeditionPanel } from '../ExpeditionPanel';

const cases = CASE_SEEDS.map(
  (seed): CaseDto => ({
    slug: seed.slug,
    name: seed.name,
    priceCoins: seed.priceCoins,
    priceKeys: seed.priceKeys,
    imageUrl: '',
    odds: seed.weights,
    previewCards: [],
  }),
);

describe('ExpeditionPanel', () => {
  it('keeps both directions optional and starts the Ashen Wastes case only after selection', async () => {
    const user = userEvent.setup();
    const onStart = vi.fn();
    render(<ExpeditionPanel cases={cases} completed={null} onStart={onStart} />);

    expect(screen.getByText(/ignore it and open any case as usual/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /follow the cinders/i }));
    expect(screen.getByRole('button', { name: /follow the cinders/i })).toHaveAttribute('aria-pressed', 'true');

    await user.click(screen.getByRole('button', { name: /^open cinderbound cache$/i }));
    expect(onStart).toHaveBeenCalledWith({ kind: 'ashen-wastes', caseSlug: 'cinderbound-cache' });
  });

  it('offers only non-set cases for the global collection direction', async () => {
    const user = userEvent.setup();
    render(<ExpeditionPanel cases={cases} completed={null} onStart={() => {}} />);

    await user.click(screen.getByRole('button', { name: /widen the archive/i }));
    expect(screen.getByRole('button', { name: 'Starter Chest' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cinderbound Cache' })).not.toBeInTheDocument();
  });
});
