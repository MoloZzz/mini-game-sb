import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { CollectionGoalDto } from '@card-game/shared-types';
import { describe, expect, it } from 'vitest';

import { CollectionGoal } from '../CollectionGoal';

const GOAL: CollectionGoalDto = {
  id: 'unique_10', kind: 'milestone', title: '10 unique cards', description: 'Collect 2 more unique cards to claim this milestone.',
  progress: { current: 8, target: 10 }, reward: { coins: 200, keys: 1 }, action: { label: 'Choose a case', href: '/' },
};

describe('CollectionGoal', () => {
  it('shows the current milestone progress, reward, and action', () => {
    render(<MemoryRouter><CollectionGoal goal={GOAL} /></MemoryRouter>);

    expect(screen.getByRole('heading', { name: '10 unique cards' })).toBeInTheDocument();
    expect(screen.getByText('8 / 10')).toBeInTheDocument();
    expect(screen.getByText('Reward: 200 coins + 1 keys')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Choose a case' })).toHaveAttribute('href', '/');
  });
});
