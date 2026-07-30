import { useMemo, useState } from 'react';
import { CASE_SEEDS, type CaseDto } from '@card-game/shared-types';

import { BalanceDisplay } from '@/components/BalanceDisplay';
import { Button } from '@/components/Button';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { ExpeditionPanel } from '@/features/expeditions/ExpeditionPanel';
import type { SessionExpedition } from '@/features/expeditions/sessionExpedition';
import { ArchiveTaskPanel } from '@/features/archive/ArchiveTaskPanel';

import { CaseCard } from './CaseCard';
import { CaseDetail } from './CaseDetail';
import { RecentDropsStrip } from './RecentDropsStrip';
import { useLobbyData } from './useLobbyData';

interface LobbyProps {
  onOpenCase: (slug: string) => void;
  completedExpedition?: SessionExpedition | null;
  onStartExpedition?: (expedition: SessionExpedition) => void;
  onOpenArchive?: () => void;
}

const EMPTY_BALANCE = { coins: 0, keys: 0 };

function isDailyBonusAvailable(availableAt: string | null): boolean {
  if (availableAt === null) return true;
  return new Date(availableAt).getTime() <= Date.now();
}

/** Same footprint as a loaded CaseCard so the grid doesn't jump when data arrives. */
function CaseCardSkeleton() {
  return (
    <div className="flex h-[19rem] flex-col overflow-hidden rounded-lg border border-neutral-800 bg-neutral-900">
      <div className="aspect-square w-full animate-pulse bg-neutral-800" />
      <div className="flex flex-1 flex-col gap-3 p-3">
        <div className="h-4 w-2/3 animate-pulse rounded bg-neutral-800" />
        <div className="flex gap-1.5">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-8 w-8 animate-pulse rounded bg-neutral-800" />
          ))}
        </div>
        <div className="mt-auto h-8 w-full animate-pulse rounded bg-neutral-800" />
      </div>
    </div>
  );
}

/**
 * The lobby screen. It never opens a case itself — POST /cases/:slug/open
 * belongs to the reel flow (owned elsewhere); this screen only hands the
 * slug upward via `onOpenCase`, keeping that call in exactly one place.
 */
export function Lobby({
  onOpenCase,
  completedExpedition = null,
  onStartExpedition = () => {},
  onOpenArchive = () => {},
}: LobbyProps) {
  const { player, cases, drops, loading, error, refresh, claimBonus, bonusError } = useLobbyData();
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);

  const selectedCase = useMemo<CaseDto | null>(
    () => cases.find((c) => c.slug === selectedSlug) ?? null,
    [cases, selectedSlug],
  );

  const balance = player?.balance ?? EMPTY_BALANCE;

  return (
    <div className="flex min-h-screen flex-col gap-8 bg-neutral-950 px-4 py-6 text-neutral-100 sm:px-6 sm:py-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">Card Game</h1>

        <div className="flex flex-wrap items-center justify-end gap-3 sm:gap-4">
          <BalanceDisplay balance={balance} />
          {player && isDailyBonusAvailable(player.dailyBonusAvailableAt) && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void claimBonus()}
              className="border-amber-400/60 bg-amber-400/10 text-amber-300 hover:border-amber-400 hover:bg-amber-400/20 hover:text-amber-200"
            >
              Claim daily bonus
            </Button>
          )}
        </div>
      </header>

      {bonusError && <ErrorBanner>{bonusError}</ErrorBanner>}

      {error && <ErrorBanner action={{ label: 'Retry', onClick: refresh }}>{error}</ErrorBanner>}

      <main className="flex-1">
        {selectedCase ? (
          <div className="mx-auto max-w-3xl">
            <CaseDetail
              case={selectedCase}
              balance={balance}
              onOpen={onOpenCase}
              onBack={() => setSelectedSlug(null)}
            />
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            {!loading && (
              <>
                <ArchiveTaskPanel onOpenArchive={onOpenArchive} />
                <ExpeditionPanel
                  cases={cases}
                  completed={completedExpedition}
                  onStart={onStartExpedition}
                />
              </>
            )}
            {/* The normal case grid remains available whether or not an expedition is selected. */}
          <div className="mx-auto grid max-w-5xl grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {loading
              ? Array.from({ length: CASE_SEEDS.length }).map((_, i) => <CaseCardSkeleton key={i} />)
              : cases.map((c) => (
                  // Clicking anywhere on the tile selects it (shows odds +
                  // detail); the card's own Open button stops that bubble so
                  // a quick-open click doesn't also flip the screen to detail.
                  <div key={c.slug} onClick={() => setSelectedSlug(c.slug)} className="cursor-pointer">
                    <CaseCard case={c} onOpen={onOpenCase} balance={balance} />
                  </div>
                ))}
          </div>
          </div>
        )}
      </main>

      <footer>
        <h2 className="mb-2 text-sm font-semibold text-neutral-400">Recent drops</h2>
        <RecentDropsStrip drops={drops} />
      </footer>
    </div>
  );
}
