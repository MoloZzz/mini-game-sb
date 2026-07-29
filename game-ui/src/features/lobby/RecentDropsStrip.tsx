import type { DropHistoryItemDto } from '@card-game/shared-types';

import { ImgWithFallback } from '@/components/ui/ImgWithFallback';
import { rarityColor, rarityTint } from '@/lib/rarityStyle';

interface RecentDropsStripProps {
  drops: DropHistoryItemDto[];
}

/**
 * Coarse "Nm/Nh/Nd ago" — this is ambient flavour, not a clock, so it never
 * needs more precision than that.
 */
function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/**
 * A horizontally scrolling strip of recent openings, newest first. This is
 * ambient — deliberately not animated, so it never competes for attention
 * with the roulette or the reveal.
 */
export function RecentDropsStrip({ drops }: RecentDropsStripProps) {
  if (drops.length === 0) {
    return <p className="text-sm text-neutral-500">No drops yet — open a case to get started.</p>;
  }

  // GET /me/drops already returns newest-first, but sort defensively so this
  // strip is correct even given an unsorted array.
  const sorted = [...drops].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return (
    <div className="flex gap-3 overflow-x-auto pb-2">
      {sorted.map((drop) => (
        <div
          key={drop.dropId}
          className="flex shrink-0 items-center gap-2 rounded-md border border-neutral-800 bg-neutral-900 py-2 pl-2 pr-3"
          style={{
            borderLeftColor: rarityColor(drop.card.rarity),
            borderLeftWidth: 3,
          }}
        >
          <ImgWithFallback
            src={drop.card.thumbUrl}
            alt=""
            fallbackColor={rarityTint(drop.card.rarity, 'fallback')}
            className="h-8 w-8 rounded object-cover"
          />
          <div className="flex flex-col">
            <span className="text-sm text-neutral-200">{drop.card.name}</span>
            <span className="text-xs text-neutral-500">
              {drop.caseName} · {relativeTime(drop.createdAt)}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
