import type { ReactNode } from 'react';
import type { Rarity } from '@card-game/shared-types';

import { rarityColor, rarityTint } from '@/lib/rarityStyle';

export interface ChipProps {
  children: ReactNode;
  active: boolean;
  onClick: () => void;
  /** When set, the chip is tinted with that rarity's colour instead of the neutral/amber scheme. */
  rarity?: Rarity;
  className?: string;
}

const BASE_CLASSES =
  'rounded-full border px-3 py-1 text-xs font-semibold capitalize transition-colors';

const NEUTRAL_CLASSES: Readonly<Record<'on' | 'off', string>> = {
  on: 'border-amber-400 bg-amber-400/10 text-amber-300',
  off: 'border-neutral-700 text-neutral-400 hover:border-neutral-500',
};

/** Inactive rarity chips keep their colour in the border only, so a row of six
 * doesn't read as six active filters. */
const INACTIVE_RARITY_TEXT = '#a3a3a3';

/**
 * A single-select filter pill. `chipClasses()` was defined twice (inventory and
 * collection filters) with the rarity variant inlined separately in each — one
 * component now owns both looks.
 */
export function Chip({ children, active, onClick, rarity, className }: ChipProps) {
  if (rarity) {
    const color = rarityColor(rarity);
    return (
      <button
        type="button"
        aria-pressed={active}
        onClick={onClick}
        className={`${BASE_CLASSES} ${className ?? ''}`}
        style={{
          borderColor: color,
          backgroundColor: active ? rarityTint(rarity, 'fallback') : 'transparent',
          color: active ? color : INACTIVE_RARITY_TEXT,
        }}
      >
        {children}
      </button>
    );
  }

  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`${BASE_CLASSES} ${active ? NEUTRAL_CLASSES.on : NEUTRAL_CLASSES.off} ${className ?? ''}`}
    >
      {children}
    </button>
  );
}
