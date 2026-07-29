import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { CardFilters, type CardFilterValue } from '@/components/filters/CardFilters';

describe('CardFilters', () => {
  it('choosing a rarity chip emits it in the query', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<CardFilters value={{}} onChange={onChange} sortIdPrefix="inventory" />);

    await user.click(screen.getByRole('button', { name: /^epic$/i }));

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ rarity: 'epic' }));
  });

  it('clicking an active rarity chip again clears it', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<CardFilters value={{ rarity: 'epic' }} onChange={onChange} sortIdPrefix="inventory" />);

    await user.click(screen.getByRole('button', { name: /^epic$/i }));

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ rarity: undefined }));
  });

  it('choosing a sort option emits it in the query', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<CardFilters value={{}} onChange={onChange} sortIdPrefix="inventory" />);

    await user.selectOptions(screen.getByLabelText(/sort/i), 'name_asc');

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ sort: 'name_asc' }));
  });

  it('hides the sort control when no prefix is given — the dex orders server-side', () => {
    render(<CardFilters value={{}} onChange={() => {}} />);
    expect(screen.queryByLabelText(/sort/i)).not.toBeInTheDocument();
  });

  it('shows "clear filters" only once something is filtered, and resets on click', async () => {
    const user = userEvent.setup();
    let value: CardFilterValue = {};
    const onChange = vi.fn((next: CardFilterValue) => {
      value = next;
    });

    const { rerender } = render(<CardFilters value={value} onChange={onChange} />);
    expect(screen.queryByRole('button', { name: /clear filters/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^rare$/i }));
    rerender(<CardFilters value={value} onChange={onChange} />);
    expect(screen.getByRole('button', { name: /clear filters/i })).toBeInTheDocument();
    expect(value.rarity).toBe('rare');

    await user.click(screen.getByRole('button', { name: /clear filters/i }));
    expect(value.rarity).toBeUndefined();
    expect(value.element).toBeUndefined();
  });
});
