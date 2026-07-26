import { CASE_SEEDS, type Element } from '@card-game/shared-types';

export interface ElementTheme {
  /** Accent colour for the tile's border/glow. */
  color: string;
  /** Small flavour glyph shown next to the label — same pattern as CURRENCY_GLYPH. */
  glyph: string;
  label: string;
}

/**
 * Cosmetic-only per-element theme. `element` drives art/accent colour and
 * nothing else (case.d.ts) — this is the one place the UI decides what each
 * element actually *looks* like. Keyed as Record<Element, ElementTheme> on
 * purpose: if ELEMENTS ever grows, this fails `tsc` instead of silently
 * leaving a new element undecorated (the exact class of bug Job 1 audits for,
 * applied here to elements instead of archetypes).
 */
export const ELEMENT_THEME: Readonly<Record<Element, ElementTheme>> = {
  fire: { color: '#f97316', glyph: '\u{1F525}', label: 'Fire' },
  water: { color: '#0ea5e9', glyph: '\u{1F4A7}', label: 'Water' },
  earth: { color: '#a16207', glyph: '\u{1FAA8}', label: 'Earth' },
  air: { color: '#67e8f9', glyph: '\u{1F32C}\u{FE0F}', label: 'Air' },
  shadow: { color: '#7c3aed', glyph: '\u{1F311}', label: 'Shadow' },
  light: { color: '#facc15', glyph: '✨', label: 'Light' },
};

/**
 * Theme for the two cases with `element: null` (starter-chest, ember-vault).
 * That null is deliberate, not a gap (case.d.ts) — so these get their own
 * consistent accent rather than falling back to "no colour at all", which
 * would read as broken next to six themed tiles.
 */
export const NO_ELEMENT_THEME: ElementTheme = { color: '#9CA3AF', glyph: '⬥', label: 'Classic' };

/**
 * Resolves a case's cosmetic theme the same way the odds table resolves
 * CASE_WEIGHTS: client-side, by slug, from CASE_SEEDS, before any network
 * call — `element` is deliberately absent from CaseDto (case.d.ts), so this
 * is the one bridge from "slug the API gave us" to "element to theme it as".
 */
export function caseThemeFor(slug: string): ElementTheme {
  const seed = CASE_SEEDS.find((c) => c.slug === slug);
  const element = seed?.element ?? null;
  return element ? ELEMENT_THEME[element] : NO_ELEMENT_THEME;
}
