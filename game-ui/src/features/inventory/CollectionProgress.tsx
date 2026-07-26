import { POOL_TARGET_TOTAL, RARITIES, RARITY_META, type CollectionProgressDto } from '@card-game/shared-types';

export interface CollectionProgressProps {
  progress: CollectionProgressDto;
}

/**
 * The screen's reason to exist beyond storage (04 - Game Design - Core
 * Loop.md §4): a headline "owned / POOL_TARGET_TOTAL" plus a per-rarity
 * breakdown against each rarity's poolTarget, so a pile of duplicates reads
 * as a collection with a visible finish line.
 */
export function CollectionProgress({ progress }: CollectionProgressProps) {
  const overallPct = POOL_TARGET_TOTAL > 0 ? (progress.owned / POOL_TARGET_TOTAL) * 100 : 0;

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-3">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-400">Collection</h2>
        <p className="text-lg font-bold text-neutral-100">
          {progress.owned} / {POOL_TARGET_TOTAL}
        </p>
      </div>

      <div className="h-2 w-full overflow-hidden rounded-full bg-neutral-800">
        <div
          className="h-full rounded-full bg-amber-400 transition-[width]"
          style={{ width: `${Math.min(100, overallPct)}%` }}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        {RARITIES.map((rarity) => {
          const { owned, total } = progress.byRarity[rarity];
          const color = RARITY_META[rarity].color;
          const rarityPct = total > 0 ? (owned / total) * 100 : 0;
          return (
            <div key={rarity} className="flex items-center gap-2 text-xs">
              <span className="w-20 shrink-0 capitalize text-neutral-400">{rarity}</span>
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-neutral-800">
                <div
                  className="h-full rounded-full transition-[width]"
                  style={{ width: `${Math.min(100, rarityPct)}%`, backgroundColor: color }}
                />
              </div>
              <span className="w-16 shrink-0 text-right text-neutral-300">
                {owned} / {total}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
