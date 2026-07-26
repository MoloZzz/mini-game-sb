import { describe, expect, it } from 'vitest';
import { CASE_SEEDS, ELEMENTS } from '@card-game/shared-types';

import { caseThemeFor, ELEMENT_THEME, NO_ELEMENT_THEME } from '../caseTheme';

// Drives the theme lookup from shared-types' own CASE_SEEDS rather than
// hardcoding slugs here, so a case added/renamed in shared-types is exercised
// automatically instead of silently skipping the new/renamed slug.
describe('caseThemeFor', () => {
  for (const seed of CASE_SEEDS) {
    it(`resolves ${seed.slug} (element: ${seed.element ?? 'null'}) to the right theme`, () => {
      const theme = caseThemeFor(seed.slug);
      if (seed.element === null) {
        expect(theme).toBe(NO_ELEMENT_THEME);
      } else {
        expect(theme).toBe(ELEMENT_THEME[seed.element]);
      }
    });
  }

  it('falls back to the neutral theme for an unknown slug', () => {
    expect(caseThemeFor('not-a-real-case')).toBe(NO_ELEMENT_THEME);
  });

  it('gives every element in shared-types a distinct theme colour', () => {
    const colors = ELEMENTS.map((el) => ELEMENT_THEME[el].color);
    expect(new Set(colors).size).toBe(ELEMENTS.length);
    // And distinct from the neutral "no element" accent too.
    expect(colors).not.toContain(NO_ELEMENT_THEME.color);
  });
});
