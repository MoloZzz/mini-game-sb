import { useState, type ReactNode } from 'react';
import type { CardDto } from '@card-game/shared-types';

import { Modal } from '@/components/ui/Modal';
import { rarityColor, rarityTint } from '@/lib/rarityStyle';

import { CardPreview } from './CardPreview';

export interface CardDetailModalProps {
  card: CardDto;
  onClose: () => void;
  /** Screen-specific block under the card — the inventory puts copies/acquired/sell here. */
  footer?: ReactNode;
}

/**
 * The single large card view, shared by the inventory and the collection.
 * They used to be two files: one rendered a 220px frame in a sidebar with a
 * 480px zoom, the other a 220px frame in a dialog with a 560px zoom. Same
 * card, two sizes. Now there is one component and one width scale.
 */
export function CardDetailModal({ card, onClose, footer }: CardDetailModalProps) {
  const [zoomed, setZoomed] = useState(false);

  return (
    <>
      <Modal
        label={`${card.name} preview`}
        closeButtonLabel="Close preview"
        onClose={onClose}
        contentClassName="w-auto items-center rounded-lg border border-neutral-800 bg-neutral-900 p-5"
      >
        <div className="flex flex-col items-center gap-4">
          <CardPreview card={card} size="md" onArtClick={() => setZoomed(true)} />

          <div className="flex flex-col items-center gap-1 text-sm text-neutral-300">
            <span
              className="rounded-full px-2 py-0.5 text-xs font-bold uppercase"
              style={{ backgroundColor: rarityTint(card.rarity, 'plate'), color: rarityColor(card.rarity) }}
            >
              {card.rarity}
            </span>
            {[card.element, card.archetype].filter(Boolean).length > 0 && (
              <span className="text-xs uppercase tracking-wide text-neutral-500">
                {[card.element, card.archetype].filter(Boolean).join(' · ')}
              </span>
            )}
          </div>

          {footer}
        </div>
      </Modal>

      {zoomed && (
        <Modal
          label={`${card.name} full size`}
          onClose={() => setZoomed(false)}
          size="lg"
          className="z-50"
          contentClassName="w-auto items-center bg-transparent"
        >
          <CardPreview card={card} size="xl" showMeta={false} />
        </Modal>
      )}
    </>
  );
}
