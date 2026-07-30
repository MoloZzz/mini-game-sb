import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorBanner } from '@/components/ui/ErrorBanner';

import { DropHistoryList } from './DropHistoryList';
import { useDropHistory } from './useDropHistory';

/** Same row footprint as a loaded drop, so the list doesn't jump on arrival. */
function DropRowSkeleton() {
  return <div className="h-[3.75rem] animate-pulse rounded-lg border border-neutral-800 bg-neutral-900" />;
}

/**
 * The drop log used to be a footer strip on the lobby, where it competed with
 * the case grid for the same screen. It is its own route now: the lobby is
 * about what to open next, this screen is about what has already dropped.
 */
export function DropHistoryPage() {
  const { drops, loading, error, refresh } = useDropHistory();

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-6 text-neutral-100 sm:px-6 sm:py-8">
      <header>
        <h1 className="text-2xl font-bold">History</h1>
        <p className="mt-2 text-sm text-neutral-400">Every card you have pulled, newest first.</p>
      </header>

      {error && <ErrorBanner action={{ label: 'Retry', onClick: refresh }}>{error}</ErrorBanner>}

      <div aria-busy={loading}>
        {loading ? (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <DropRowSkeleton key={i} />
            ))}
          </div>
        ) : drops.length === 0 ? (
          <EmptyState>No drops yet — open a case to get started.</EmptyState>
        ) : (
          <DropHistoryList drops={drops} />
        )}
      </div>
    </main>
  );
}
