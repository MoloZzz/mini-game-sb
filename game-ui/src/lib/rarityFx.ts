import { type Rarity } from '@card-game/shared-types';

/**
 * Reveal FX escalation table.
 * Source: card-game-data/08 - UI - Roulette Spec.md, "Ефекти за рідкістю".
 *
 * The escalation is DELIBERATELY uneven: common→uncommon is almost nothing,
 * epic→legendary is enormous. A linear ramp would make a legendary drop feel
 * like "one more step" instead of an event — so the numbers below jump hard
 * at the top of the table and barely move at the bottom.
 */

export type FlashKind = 'none' | 'glow' | 'pulse' | 'burst' | 'screen';

export interface RarityFxSpec {
  /** Outward-bursting particles on landing. Zero below epic — see the ratio note below. */
  particleCount: number;
  /** Peak wrapper displacement for the landing shake, in px. 0 = no shake at all. */
  shakeIntensityPx: number;
  shakeDurationMs: number;
  flash: FlashKind;
  /** Vertical beam column, rare and up. */
  beam: boolean;
  /** Rotating ray wedges, legendary and up. */
  rays: boolean;
  /** Falling confetti, mythic only. */
  confetti: boolean;
  /** How long the rest of the UI (buttons, background) should stay frozen. */
  uiFreezeMs: number;
  /** How long the card needs to read as "fully revealed" before it's considered settled. */
  revealDurationMs: number;
}

export const RARITY_FX: Readonly<Record<Rarity, RarityFxSpec>> = {
  // "nothing, a quiet click"
  common: {
    particleCount: 0,
    shakeIntensityPx: 0,
    shakeDurationMs: 0,
    flash: 'none',
    beam: false,
    rays: false,
    confetti: false,
    uiFreezeMs: 0,
    revealDurationMs: 500,
  },
  // "soft green tile glow" — a hair above common, not a new tier of spectacle.
  uncommon: {
    particleCount: 0,
    shakeIntensityPx: 0,
    shakeDurationMs: 0,
    flash: 'glow',
    beam: false,
    rays: false,
    confetti: false,
    uiFreezeMs: 0,
    revealDurationMs: 500,
  },
  // "blue pulse + an upward beam"
  rare: {
    particleCount: 0,
    shakeIntensityPx: 0,
    shakeDurationMs: 0,
    flash: 'pulse',
    beam: true,
    rays: false,
    confetti: false,
    uiFreezeMs: 0,
    revealDurationMs: 550,
  },
  // "purple flash, ~20 particles, slight shake" — the first tier with any particles or shake at all.
  epic: {
    particleCount: 20,
    shakeIntensityPx: 2,
    shakeDurationMs: 300,
    flash: 'burst',
    beam: true,
    rays: false,
    confetti: false,
    uiFreezeMs: 0,
    revealDurationMs: 650,
  },
  // "gold burst, rays, ~60 particles, harder shake, fanfare" — the big jump: 3x epic's
  // particles and 3x its shake, plus rays, which nothing below this tier gets at all.
  legendary: {
    particleCount: 60,
    shakeIntensityPx: 6,
    shakeDurationMs: 500,
    flash: 'burst',
    beam: true,
    rays: true,
    confetti: false,
    uiFreezeMs: 0,
    revealDurationMs: 800,
  },
  // "screen fill, time dilation, confetti, full UI stop for ~1s"
  mythic: {
    particleCount: 140,
    shakeIntensityPx: 14,
    shakeDurationMs: 700,
    flash: 'screen',
    beam: true,
    rays: true,
    confetti: true,
    uiFreezeMs: 1000,
    revealDurationMs: 1000,
  },
};
