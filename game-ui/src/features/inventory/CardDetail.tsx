import { useState } from 'react';
import { RARITY_META, type InventoryItemDto } from '@card-game/shared-types';

export interface CardDetailProps {
  item: InventoryItemDto;
  onSell: (instanceId: string) => void;
  selling: boolean;
  sellError: string | null;
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? '')
    .join('');
}

function formatAcquiredAt(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

/**
 * The large single-card view. Per ADR-005 the frame, name, stats and flavour
 * text are DOM and CSS — Stable Diffusion cannot render legible text, so the
 * model draws only the square art window below, and that window is the only
 * `<img>` this component renders.
 */
export function CardDetail({ item, onSell, selling, sellError }: CardDetailProps) {
  const [broken, setBroken] = useState(false);
  // A second click confirms the sell — selling is irreversible, so one click
  // can't trigger it outright.
  const [confirming, setConfirming] = useState(false);
  const { card, copies, acquiredAt, instanceId } = item;
  const color = RARITY_META[card.rarity].color;
  const sellValue = RARITY_META[card.rarity].sellValue;
  const metaLine = [card.element, card.archetype].filter(Boolean).join(' · ');

  function handleSellClick() {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    onSell(instanceId);
    setConfirming(false);
  }

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-neutral-800 bg-neutral-900 p-5">
      <div
        className="mx-auto overflow-hidden rounded-lg border-[3px]"
        style={{ width: 220, borderColor: color, boxShadow: `0 0 24px 6px ${color}33` }}
      >
        <div
          className="truncate px-2 py-1.5 text-center text-sm font-bold text-neutral-100"
          style={{ backgroundColor: `${color}22` }}
        >
          {card.name}
        </div>

        <div className="relative w-full" style={{ aspectRatio: '1 / 1', backgroundColor: `${color}1a` }}>
          {broken ? (
            <div
              className="flex h-full w-full items-center justify-center text-4xl font-bold"
              style={{ backgroundColor: `${color}33`, color }}
            >
              {initials(card.name)}
            </div>
          ) : (
            <img
              src={card.imageUrl}
              alt={card.name}
              draggable={false}
              className="h-full w-full object-cover"
              onError={() => setBroken(true)}
            />
          )}
        </div>

        <div className="flex items-center justify-between px-3 py-1.5 text-sm font-semibold text-neutral-200">
          <span>ATK {card.attack}</span>
          <span>DEF {card.defense}</span>
        </div>

        {card.flavorText && (
          <p className="px-3 pb-1.5 text-center text-xs italic text-neutral-400">{card.flavorText}</p>
        )}
      </div>

      <div className="flex flex-col items-center gap-1 text-sm text-neutral-300">
        <span
          className="rounded-full px-2 py-0.5 text-xs font-bold uppercase"
          style={{ backgroundColor: `${color}22`, color }}
        >
          {card.rarity}
        </span>
        {metaLine && <span className="text-xs uppercase tracking-wide text-neutral-500">{metaLine}</span>}
        <span>{`Copies owned: ${copies}`}</span>
        <span className="text-xs text-neutral-500">{`Acquired ${formatAcquiredAt(acquiredAt)}`}</span>
      </div>

      {copies > 1 ? (
        <div className="flex flex-col items-center gap-2">
          <button
            type="button"
            disabled={selling}
            onClick={handleSellClick}
            className={`rounded-md px-4 py-2 text-sm font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
              confirming ? 'bg-red-500 text-neutral-950 hover:bg-red-400' : 'bg-amber-400 text-neutral-950 hover:bg-amber-300'
            }`}
          >
            {selling
              ? 'Selling…'
              : confirming
                ? `Confirm sell · +${sellValue} coins`
                : `Sell one copy · +${sellValue} coins`}
          </button>
          {confirming && !selling && (
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="text-xs text-neutral-500 underline hover:text-neutral-300"
            >
              Cancel
            </button>
          )}
        </div>
      ) : (
        // The rule (04 - Game Design - Core Loop.md §4, contract's LAST_COPY
        // 409) exists so a player can't accidentally destroy their only copy
        // of a card and lose it from the collection. The server would refuse
        // this anyway, so the UI never offers an action guaranteed to fail.
        <p className="text-center text-xs text-neutral-500">
          This is your only copy — selling it would remove the card from your collection.
        </p>
      )}

      {sellError && <p className="text-center text-xs text-red-400">{sellError}</p>}
    </div>
  );
}
