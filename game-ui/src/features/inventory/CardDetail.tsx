import { useState } from 'react';
import { RARITY_META, type InventoryItemDto } from '@card-game/shared-types';

import { Button } from '@/components/Button';
import { CardDetailModal } from '@/components/card/CardDetailModal';

export interface CardDetailProps {
  item: InventoryItemDto;
  onClose: () => void;
  onSell: (instanceId: string) => void;
  selling: boolean;
  sellError: string | null;
}

function formatAcquiredAt(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

/**
 * The inventory's large card view: the shared `CardDetailModal` plus the parts
 * only the bag has — how many copies, when it was acquired, and selling. The
 * frame, zoom and dialog behaviour are not this component's business, which is
 * what keeps it identical to the collection's view.
 */
export function CardDetail({ item, onClose, onSell, selling, sellError }: CardDetailProps) {
  // A second click confirms the sell — selling is irreversible, so one click
  // can't trigger it outright.
  const [confirming, setConfirming] = useState(false);
  const { card, copies, acquiredAt, instanceId } = item;
  const sellValue = RARITY_META[card.rarity].sellValue;

  function handleSellClick() {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    onSell(instanceId);
    setConfirming(false);
  }

  return (
    <CardDetailModal
      card={card}
      onClose={onClose}
      footer={
        <div className="flex flex-col items-center gap-2">
          <span className="text-sm text-neutral-300">{`Copies owned: ${copies}`}</span>
          <span className="text-xs text-neutral-500">{`Acquired ${formatAcquiredAt(acquiredAt)}`}</span>

          {copies > 1 ? (
            <>
              <Button
                variant={confirming ? 'danger' : 'primary'}
                size="sm"
                disabled={selling}
                onClick={handleSellClick}
              >
                {selling
                  ? 'Selling…'
                  : confirming
                    ? `Confirm sell · +${sellValue} coins`
                    : `Sell one copy · +${sellValue} coins`}
              </Button>
              {confirming && !selling && (
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  className="text-xs text-neutral-500 underline hover:text-neutral-300"
                >
                  Cancel
                </button>
              )}
            </>
          ) : (
            // The rule (04 - Game Design - Core Loop.md §4, contract's LAST_COPY
            // 409) exists so a player can't accidentally destroy their only copy
            // of a card and lose it from the collection. The server would refuse
            // this anyway, so the UI never offers an action guaranteed to fail.
            <p className="max-w-xs text-center text-xs text-neutral-500">
              This is your only copy — selling it would remove the card from your collection.
            </p>
          )}

          {sellError && <p className="text-center text-xs text-red-400">{sellError}</p>}
        </div>
      }
    />
  );
}
