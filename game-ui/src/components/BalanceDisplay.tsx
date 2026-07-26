import type { Balance } from '@card-game/shared-types';

import { AnimatedNumber } from './AnimatedNumber';

interface BalanceDisplayProps {
  balance: Balance;
  className?: string;
}

/**
 * Coins and keys are deliberately styled differently, not just two numbers
 * in the same font: coins are the soft, generously-granted currency (plain
 * glyph, warm colour), keys are the hard, scarce one that opens the better
 * cases (a bordered "badge" treatment sets it apart at a glance).
 */
export function BalanceDisplay({ balance, className }: BalanceDisplayProps) {
  return (
    <div className={`flex items-center gap-4 ${className ?? ''}`}>
      <div className="flex items-center gap-1.5 text-amber-400" title="Coins">
        <span aria-hidden="true" className="text-lg leading-none">
          🪙
        </span>
        <AnimatedNumber value={balance.coins} className="text-lg font-semibold tabular-nums" />
      </div>

      <div
        className="flex items-center gap-1.5 rounded-md border border-violet-400/40 bg-violet-500/10 px-2 py-1 text-violet-300"
        title="Keys"
      >
        <span aria-hidden="true" className="text-base leading-none">
          🔑
        </span>
        <AnimatedNumber value={balance.keys} className="text-base font-semibold tabular-nums" />
      </div>
    </div>
  );
}
