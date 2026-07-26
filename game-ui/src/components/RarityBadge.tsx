import { RARITY_META, type Rarity } from '@card-game/shared-types';

interface RarityBadgeProps {
  rarity: Rarity;
  className?: string;
}

function capitalize(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

/** Small rarity pill reused across reveal, inventory and the lobby. Colour always
 * comes from RARITY_META — never hardcoded, so a rarity's colour can change in
 * exactly one place. */
export function RarityBadge({ rarity, className }: RarityBadgeProps) {
  const { color } = RARITY_META[rarity];

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold leading-5 ${className ?? ''}`}
      style={{ backgroundColor: `${color}22`, color, borderColor: color }}
    >
      {capitalize(rarity)}
    </span>
  );
}
