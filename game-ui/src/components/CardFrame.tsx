import { useState } from 'react';
import { RARITY_META, type CardDto, type Rarity } from '@card-game/shared-types';

export type CardFrameSize = 'sm' | 'md' | 'lg';

export interface CardFrameProps {
  card: CardDto;
  size?: CardFrameSize;
  showStats?: boolean;
  className?: string;
}

const WIDTH_BY_SIZE: Readonly<Record<CardFrameSize, number>> = { sm: 180, md: 260, lg: 340 };

/** Glow radius (px) scales with rarity so the frame alone signals importance,
 * before the player reads a single word — common gets none, mythic gets a lot. */
const GLOW_BLUR_BY_RARITY: Readonly<Record<Rarity, number>> = {
  common: 0,
  uncommon: 8,
  rare: 14,
  epic: 20,
  legendary: 30,
  mythic: 44,
};

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? '')
    .join('');
}

/**
 * ADR-005: Stable Diffusion cannot render legible text (a CLIP-encoder
 * limitation, not a prompt problem) — so the model draws only the square art
 * window. Everything else here — frame, name, stats, flavour text — is DOM
 * and CSS. Re-skinning the frame, renaming a card, or reassigning its rarity
 * never touches the image file. This is how Hearthstone and MTG are built.
 */
export function CardFrame({ card, size = 'md', showStats = true, className }: CardFrameProps) {
  const [broken, setBroken] = useState(false);
  const { color } = RARITY_META[card.rarity];
  const width = WIDTH_BY_SIZE[size];
  const glow = GLOW_BLUR_BY_RARITY[card.rarity];
  const metaLine = [card.element, card.archetype].filter(Boolean).join(' · ');

  return (
    <div
      className={`flex flex-col overflow-hidden rounded-lg border-[3px] bg-neutral-900 ${className ?? ''}`}
      style={{
        width,
        borderColor: color,
        boxShadow: glow > 0 ? `0 0 ${glow}px ${Math.round(glow / 3)}px ${color}66` : undefined,
      }}
    >
      {/* Name plate */}
      <div
        className="truncate px-2 py-1.5 text-center text-sm font-bold text-neutral-100"
        style={{ backgroundColor: `${color}22` }}
      >
        {card.name}
      </div>

      {/* Art window — the ONLY <img> in this component. Everything around it is markup. */}
      <div className="relative w-full" style={{ aspectRatio: '1 / 1', backgroundColor: `${color}1a` }}>
        {broken ? (
          <div
            className="flex h-full w-full items-center justify-center font-bold"
            style={{ backgroundColor: `${color}33`, color, fontSize: width / 6 }}
          >
            {initials(card.name)}
          </div>
        ) : (
          <img
            src={card.imageUrl}
            alt={card.name}
            draggable={false}
            loading="lazy"
            className="h-full w-full object-cover"
            onError={() => setBroken(true)}
          />
        )}
      </div>

      {showStats && (
        <div className="flex items-center justify-between px-3 py-1.5 text-sm font-semibold text-neutral-200">
          <span>ATK {card.attack}</span>
          <span>DEF {card.defense}</span>
        </div>
      )}

      {card.flavorText && (
        <p className="px-3 pb-1.5 text-center text-xs italic text-neutral-400">{card.flavorText}</p>
      )}

      {metaLine && (
        <p className="truncate px-3 pb-2 text-center text-[11px] uppercase tracking-wide text-neutral-500">
          {metaLine}
        </p>
      )}
    </div>
  );
}
