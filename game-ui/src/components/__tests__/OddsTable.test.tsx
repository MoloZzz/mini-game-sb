import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import { CASE_WEIGHTS, RARITIES, oneInN } from '@card-game/shared-types';

import { OddsTable } from '../OddsTable';

function rowFor(rarity: string): HTMLElement {
  const label = screen.getByText(new RegExp(`^${rarity}$`, 'i'));
  const row = label.closest('tr');
  if (!row) throw new Error(`No <tr> ancestor found for rarity "${rarity}"`);
  return row;
}

describe('OddsTable', () => {
  it('starter-chest: every rarity row shows both a % and a "1 in N" value', () => {
    const odds = CASE_WEIGHTS['starter-chest'];
    render(<OddsTable odds={odds} />);

    // Iterating RARITIES (not a hardcoded list) means a new rarity added to
    // shared-types fails this test instead of silently going unchecked.
    for (const rarity of RARITIES) {
      const percent = odds[rarity];
      const row = rowFor(rarity);
      expect(row.textContent).toContain(`${percent}%`);

      const n = oneInN(percent);
      if (n === null) {
        expect(row.textContent).toContain('—');
      } else {
        expect(row.textContent).toMatch(/1 in [\d.]+/);
      }
    }
  });

  it('mythic at 0.2% reads "1 in 500"', () => {
    const odds = CASE_WEIGHTS['starter-chest'];
    render(<OddsTable odds={odds} />);

    expect(rowFor('mythic').textContent).toContain('1 in 500');
  });

  it('epic at 4.5% and legendary at 1.3% round the way the source table does', () => {
    const odds = CASE_WEIGHTS['starter-chest'];
    render(<OddsTable odds={odds} />);

    expect(rowFor('epic').textContent).toContain('1 in 22');
    expect(rowFor('legendary').textContent).toContain('1 in 77');
  });

  it('ember-vault: the 0% common row renders — and never "Infinity" or "NaN"', () => {
    const odds = CASE_WEIGHTS['ember-vault'];
    render(<OddsTable odds={odds} />);

    const commonRow = rowFor('common');
    expect(commonRow.textContent).toContain('—');
    expect(commonRow.textContent).not.toMatch(/Infinity/);
    expect(commonRow.textContent).not.toMatch(/NaN/);

    for (const rarity of RARITIES) {
      const row = rowFor(rarity);
      expect(row.textContent).not.toMatch(/Infinity/);
      expect(row.textContent).not.toMatch(/NaN/);
    }
  });
});
