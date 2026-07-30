import { useEffect, useMemo, useState } from 'react';
import type { ArchiveStatusDto } from '@card-game/shared-types';

import { Button } from '@/components/Button';
import { CardGrid } from '@/components/card/CardGrid';
import { CardTile } from '@/components/card/CardTile';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { Panel } from '@/components/ui/Panel';
import { TileSkeleton } from '@/components/ui/TileSkeleton';
import { ApiClientError, isApiErrorCode, USER_MESSAGES } from '@/lib/apiError';
import { createArchiveDossier, getArchive } from '@/lib/api';

interface ArchiveNotesPageProps {
  onOpenPass: (passId: string) => void;
}

function errorMessage(error: unknown): string {
  if (error instanceof ApiClientError && isApiErrorCode(error.code)) return USER_MESSAGES[error.code];
  return error instanceof Error ? error.message : 'Could not update Archive Notes.';
}

/**
 * The task surface is deliberately its own route: it consumes no cards and
 * exposes neither collection goals nor achievement history.
 */
export function ArchiveNotesPage({ onOpenPass }: ArchiveNotesPageProps) {
  const [archive, setArchive] = useState<ArchiveStatusDto | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    getArchive()
      .then((next) => {
        if (!active) return;
        setArchive(next);
        setSelectedIds([]);
      })
      .catch((reason: unknown) => active && setError(errorMessage(reason)))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  const eligibleCount = useMemo(
    () => archive?.noteCards.filter((note) => !note.documented).length ?? 0,
    [archive],
  );

  function toggleCard(cardId: string) {
    setError(null);
    setSelectedIds((current) => {
      if (current.includes(cardId)) return current.filter((id) => id !== cardId);
      return current.length < 3 ? [...current, cardId] : current;
    });
  }

  async function createDossier() {
    if (selectedIds.length !== 3 || creating) return;
    setCreating(true);
    setError(null);
    try {
      const response = await createArchiveDossier(selectedIds as [string, string, string]);
      setArchive((current) => current && {
        noteCards: current.noteCards.map((note) =>
          response.documentedCardIds.includes(note.card.id) ? { ...note, documented: true } : note,
        ),
        passes: [...current.passes, response.pass],
      });
      setSelectedIds([]);
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setCreating(false);
    }
  }

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-6 text-neutral-100 sm:px-6 sm:py-8">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-300">Tasks</p>
        <h1 className="mt-1 text-2xl font-bold">Archive Notes</h1>
        <p className="mt-2 max-w-2xl text-sm text-neutral-400">Choose three undocumented, unique cards. Documenting a card never removes it from your collection.</p>
      </header>

      {error && <ErrorBanner>{error}</ErrorBanner>}

      {loading ? (
        <CardGrid><TileSkeleton /></CardGrid>
      ) : archive && (
        <>
          <Panel padding="md" className="flex flex-wrap items-center justify-between gap-4 border-sky-400/30">
            <div>
              <p className="font-semibold text-neutral-100">Build a dossier</p>
              <p className="mt-1 text-sm text-neutral-400">{selectedIds.length} of 3 cards selected · {eligibleCount} undocumented cards available</p>
            </div>
            <Button onClick={() => void createDossier()} disabled={selectedIds.length !== 3 || creating}>
              {creating ? 'Documenting…' : 'Create dossier'}
            </Button>
          </Panel>

          {archive.noteCards.length === 0 ? (
            <EmptyState>Open cases to find unique cards for your first Archive dossier.</EmptyState>
          ) : (
            <CardGrid>
              {archive.noteCards.map((note) => {
                const selected = selectedIds.includes(note.card.id);
                const limitReached = selectedIds.length === 3 && !selected;
                const disabled = note.documented || limitReached || creating;
                return (
                  <CardTile
                    key={note.card.id}
                    card={note.card}
                    selected={selected}
                    disabled={disabled}
                    onSelect={() => toggleCard(note.card.id)}
                    badge={note.documented ? <span className="absolute right-1 top-1 rounded-full bg-sky-950/90 px-2 py-0.5 text-[10px] font-bold text-sky-200">DOCUMENTED</span> : undefined}
                  />
                );
              })}
            </CardGrid>
          )}

          <section aria-labelledby="archive-passes-heading">
            <h2 id="archive-passes-heading" className="text-lg font-bold text-neutral-100">Archive Passes</h2>
            {archive.passes.length === 0 ? (
              <p className="mt-2 text-sm text-neutral-500">Create a dossier to earn your first pass.</p>
            ) : (
              <div className="mt-3 flex flex-wrap gap-3">
                {archive.passes.map((pass) => (
                  <Panel key={pass.id} padding="sm" className="flex flex-wrap items-center gap-3 border-amber-400/30">
                    <span className="text-sm font-semibold text-amber-200">Archive Pass</span>
                    <Button className="w-full sm:w-auto" size="sm" onClick={() => onOpenPass(pass.id)}>Open Archive Cache</Button>
                  </Panel>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </main>
  );
}
