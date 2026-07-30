import { useMemo } from 'react';
import type { DropHistoryItemDto } from '@card-game/shared-types';

import { ImgWithFallback } from '@/components/ui/ImgWithFallback';
import { Panel } from '@/components/ui/Panel';
import { initials, rarityColor, rarityTint } from '@/lib/rarityStyle';

interface DropHistoryListProps {
  drops: DropHistoryItemDto[];
}

/**
 * Coarse "Nm/Nh/Nd ago" — the exact clock time sits in the row's `title`, so
 * this line never needs more precision than that.
 */
export function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/** Local-day bucket label: Today / Yesterday / an explicit date. */
function dayLabel(iso: string): string {
  const date = new Date(iso);
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const dayDiff = Math.round((startOfDay(new Date()) - startOfDay(date)) / 86_400_000);
  if (dayDiff <= 0) return 'Today';
  if (dayDiff === 1) return 'Yesterday';
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

interface DropDay {
  label: string;
  drops: DropHistoryItemDto[];
}

/** Newest first, then split into local-day sections in that same order. */
function groupByDay(drops: DropHistoryItemDto[]): DropDay[] {
  // GET /me/drops already returns newest-first, but sort defensively so the
  // list is correct even given an unsorted array.
  const sorted = [...drops].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const days: DropDay[] = [];
  for (const drop of sorted) {
    const label = dayLabel(drop.createdAt);
    const current = days[days.length - 1];
    if (current && current.label === label) current.drops.push(drop);
    else days.push({ label, drops: [drop] });
  }
  return days;
}

function DropRow({ drop }: { drop: DropHistoryItemDto }) {
  const color = rarityColor(drop.card.rarity);

  return (
    <Panel
      padding="none"
      title={new Date(drop.createdAt).toLocaleString()}
      className="flex items-center gap-3 py-2 pl-2 pr-3"
      style={{ borderLeftColor: color, borderLeftWidth: 3 }}
    >
      <ImgWithFallback
        src={drop.card.thumbUrl}
        alt=""
        fallbackColor={rarityTint(drop.card.rarity, 'fallback')}
        fallbackContent={
          <span className="flex h-full w-full items-center justify-center text-[10px] font-bold" style={{ color }}>
            {initials(drop.card.name)}
          </span>
        }
        className="h-10 w-10 shrink-0 rounded object-cover"
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm text-neutral-200">{drop.card.name}</span>
        <span className="truncate text-xs text-neutral-500">{drop.caseName}</span>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <span
          className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
          style={{ color, backgroundColor: rarityTint(drop.card.rarity, 'plate') }}
        >
          {drop.card.rarity}
        </span>
        <span className="text-xs text-neutral-500">{relativeTime(drop.createdAt)}</span>
      </div>
    </Panel>
  );
}

/**
 * The full drop log, newest first. It replaced the lobby's ambient strip: on
 * its own route there is nothing to compete with, so rows stay readable
 * instead of scrolling sideways.
 */
export function DropHistoryList({ drops }: DropHistoryListProps) {
  const days = useMemo(() => groupByDay(drops), [drops]);

  return (
    <div className="flex flex-col gap-6">
      {days.map((day) => (
        <section key={day.label} aria-label={day.label} className="flex flex-col gap-2">
          <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">
            {day.label}
          </h2>
          {day.drops.map((drop) => (
            <DropRow key={drop.dropId} drop={drop} />
          ))}
        </section>
      ))}
    </div>
  );
}
