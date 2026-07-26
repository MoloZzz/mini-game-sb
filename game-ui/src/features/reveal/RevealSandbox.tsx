import { useEffect, useMemo, useState } from 'react';
import { RARITIES, WINNING_INDEX, type OpenCaseResponse, type Rarity } from '@card-game/shared-types';

import { cardsByRarity } from '@/mocks/fixtures/cards';
import { buildReel } from '@/mocks/fixtures/reel';

import { Reveal } from './Reveal';

const RARITY_LABELS: Readonly<Record<Rarity, string>> = {
  common: 'Common',
  uncommon: 'Uncommon',
  rare: 'Rare',
  epic: 'Epic',
  legendary: 'Legendary',
  mythic: 'Mythic',
};

let dropSeq = 0;

function buildFixture(rarity: Rarity, isDuplicate: boolean): OpenCaseResponse {
  const card = cardsByRarity[rarity][0]!;
  dropSeq += 1;
  return {
    dropId: `sandbox-drop-${rarity}-${isDuplicate ? 'dup' : 'new'}-${dropSeq}`,
    reel: buildReel(card, () => 0.5),
    winningIndex: WINNING_INDEX,
    wonCard: card,
    isDuplicate,
    copies: isDuplicate ? 3 : 1,
    balance: { coins: 1240, keys: 4 },
  };
}

/**
 * Human-driven flip-through of every rarity x duplicate-state combination, plus
 * a reduced-motion toggle. Nothing else imports this yet — the orchestrator
 * wires routing later. Cards come from the real mock fixture pool
 * (mocks/fixtures/cards.ts), not invented data.
 */
export function RevealSandbox() {
  const [rarity, setRarity] = useState<Rarity>('common');
  const [isDuplicate, setIsDuplicate] = useState(false);
  const [forceReducedMotion, setForceReducedMotion] = useState(false);
  const [nonce, setNonce] = useState(0);

  const result = useMemo(() => buildFixture(rarity, isDuplicate), [rarity, isDuplicate, nonce]);

  // usePrefersReducedMotion reads window.matchMedia once at mount. Overriding it
  // here — rather than plumbing a prop through Reveal, which the real contract
  // doesn't have — lets this debug toggle exercise the actual OS-setting code
  // path instead of a sandbox-only shortcut.
  useEffect(() => {
    const original = window.matchMedia;
    window.matchMedia = ((query: string) => {
      const matches = query.includes('prefers-reduced-motion') ? forceReducedMotion : false;
      return {
        matches,
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      } as unknown as MediaQueryList;
    }) as typeof window.matchMedia;

    return () => {
      window.matchMedia = original;
    };
  }, [forceReducedMotion]);

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <div className="mx-auto flex max-w-3xl flex-col gap-4 px-6 py-6">
        <h1 className="text-xl font-bold">Reveal Sandbox</h1>

        <div className="flex flex-wrap gap-2">
          {RARITIES.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRarity(r)}
              className={`rounded-md border px-3 py-1.5 text-sm transition-colors ${
                r === rarity
                  ? 'border-amber-400 bg-amber-400/10 text-amber-300'
                  : 'border-neutral-700 text-neutral-300 hover:border-neutral-500'
              }`}
            >
              {RARITY_LABELS[r]}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-4 text-sm text-neutral-300">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={isDuplicate}
              onChange={(e) => setIsDuplicate(e.target.checked)}
            />
            Duplicate (×3)
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={forceReducedMotion}
              onChange={(e) => setForceReducedMotion(e.target.checked)}
            />
            Force reduced motion
          </label>
        </div>
      </div>

      <Reveal
        key={`${result.dropId}-${forceReducedMotion}`}
        result={result}
        caseName="Sandbox Case"
        onAgain={() => setNonce((n) => n + 1)}
        onToInventory={() => window.alert('to inventory')}
      />
    </div>
  );
}
