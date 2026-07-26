import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { InventoryFilters } from '../InventoryFilters';
import type { InventoryFilterState } from '../useInventory';

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

beforeEach(() => {
  stubMatchMedia();
});

describe('InventoryFilters', () => {
  it('choosing a rarity chip emits it in the query', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<InventoryFilters value={{}} onChange={onChange} />);

    await user.click(screen.getByRole('button', { name: /^epic$/i }));

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ rarity: 'epic' }));
  });

  it('clicking an active rarity chip again clears it', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<InventoryFilters value={{ rarity: 'epic' }} onChange={onChange} />);

    await user.click(screen.getByRole('button', { name: /^epic$/i }));

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ rarity: undefined }));
  });

  it('choosing a sort option emits it in the query', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<InventoryFilters value={{}} onChange={onChange} />);

    await user.selectOptions(screen.getByLabelText(/sort/i), 'name_asc');

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ sort: 'name_asc' }));
  });

  it('shows "clear filters" only once something is filtered, and resets on click', async () => {
    const user = userEvent.setup();
    let value: InventoryFilterState = {};
    const onChange = vi.fn((next: InventoryFilterState) => {
      value = next;
    });

    const { rerender } = render(<InventoryFilters value={value} onChange={onChange} />);
    expect(screen.queryByRole('button', { name: /clear filters/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^rare$/i }));
    rerender(<InventoryFilters value={value} onChange={onChange} />);
    expect(screen.getByRole('button', { name: /clear filters/i })).toBeInTheDocument();
    expect(value.rarity).toBe('rare');

    await user.click(screen.getByRole('button', { name: /clear filters/i }));
    expect(value.rarity).toBeUndefined();
    expect(value.element).toBeUndefined();
  });
});
