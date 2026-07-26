import { RARITIES, RARITY_META, oneInN, type RarityWeights } from '@card-game/shared-types';

interface OddsTableProps {
  odds: RarityWeights;
  className?: string;
}

/**
 * "0.2%" is an abstraction; "1 in 500" is a feeling — showing both is
 * mandatory (05 - Game Design - Rarity & Drop Rates.md). Below 10, a whole
 * number hides real differences (2 vs 3 vs 4 all feel about the same);
 * above 10 a decimal is just noise nobody reads. This matches the rounding
 * already used in the source table (1 in 1.7, 1 in 22, 1 in 500).
 */
function formatOneInN(percent: number): string {
  const n = oneInN(percent);
  if (n === null) return '—';
  return n < 10 ? `1 in ${n.toFixed(1)}` : `1 in ${Math.round(n)}`;
}

function formatPercent(percent: number): string {
  // Weights in shared-types are already clean (60, 4.5, 0.2, …) — no
  // further rounding needed, just the unit.
  return `${percent}%`;
}

/**
 * One row per rarity, always in RARITIES order so a rarity added to
 * shared-types shows up here (and in the tests) automatically.
 */
export function OddsTable({ odds, className }: OddsTableProps) {
  return (
    <table className={`w-full border-collapse text-sm ${className ?? ''}`}>
      <thead>
        <tr className="text-left text-neutral-500">
          <th className="pb-2 font-normal">Rarity</th>
          <th className="pb-2 pr-2 text-right font-normal">Chance</th>
          <th className="pb-2 text-right font-normal">Odds</th>
        </tr>
      </thead>
      <tbody>
        {RARITIES.map((rarity) => {
          const percent = odds[rarity];
          const color = RARITY_META[rarity].color;

          return (
            <tr key={rarity} className="border-t border-neutral-800">
              <td className="py-2 pr-4">
                <div className="flex items-center gap-2">
                  <span
                    aria-hidden="true"
                    className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: color }}
                  />
                  <span className="capitalize text-neutral-200">{rarity}</span>
                </div>
                {/* Bar visualisation — makes the shape of a case's odds
                    readable at a glance, without reading every number. */}
                <div className="mt-1 h-1 w-full max-w-[10rem] overflow-hidden rounded-full bg-neutral-800">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${Math.max(0, Math.min(100, percent))}%`, backgroundColor: color }}
                  />
                </div>
              </td>
              <td className="py-2 pr-2 text-right text-neutral-300">{formatPercent(percent)}</td>
              <td className="py-2 text-right text-neutral-400">{formatOneInN(percent)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
