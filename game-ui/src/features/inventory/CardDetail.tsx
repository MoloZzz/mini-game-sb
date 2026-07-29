import { useEffect, useState } from 'react';
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
 * `<img>` this component renders by default. Clicking the art opens a bigger
 * (still DOM-scaled, not browser-fullscreen) zoom overlay of the same card.
 */
export function CardDetail({ item, onSell, selling, sellError }: CardDetailProps) {
  const [broken, setBroken] = useState(false);
  // A second click confirms the sell — selling is irreversible, so one click
  // can't trigger it outright.
  const [confirming, setConfirming] = useState(false);
  const [zoomed, setZoomed] = useState(false);
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

  useEffect(() => {
    if (!zoomed) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setZoomed(false);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [zoomed]);

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

        <button
          type="button"
          onClick={() => setZoomed(true)}
          aria-label="View full size"
          className="group relative block w-full cursor-zoom-in"
          style={{ aspectRatio: '1 / 1', backgroundColor: `${color}1a` }}
        >
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
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition-opacity group-hover:bg-black/30 group-hover:opacity-100">
            <span className="rounded-full bg-neutral-950/80 px-2 py-1 text-xs font-semibold text-neutral-100">
              Click to enlarge
            </span>
          </span>
        </button>

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

      {zoomed && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-6"
          onClick={() => setZoomed(false)}
        >
          <div
            className="relative flex max-h-full flex-col overflow-hidden rounded-lg border-[3px]"
            style={{ width: 'min(90vw, 480px)', borderColor: color, boxShadow: `0 0 40px 10px ${color}33` }}
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setZoomed(false)}
              aria-label="Close"
              className="absolute right-2 top-2 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-neutral-950/80 text-lg font-bold text-neutral-100 hover:bg-neutral-800"
            >
              ×
            </button>

            <div
              className="truncate px-3 py-2 text-center text-base font-bold text-neutral-100"
              style={{ backgroundColor: `${color}22` }}
            >
              {card.name}
            </div>

            <div className="relative w-full" style={{ aspectRatio: '1 / 1', backgroundColor: `${color}1a` }}>
              {broken ? (
                <div
                  className="flex h-full w-full items-center justify-center text-6xl font-bold"
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

            <div className="flex items-center justify-between px-4 py-2 text-base font-semibold text-neutral-200">
              <span>ATK {card.attack}</span>
              <span>DEF {card.defense}</span>
            </div>

            {card.flavorText && (
              <p className="px-4 pb-3 text-center text-sm italic text-neutral-400">{card.flavorText}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
