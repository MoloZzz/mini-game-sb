import { useMemo, useState } from 'react';
import { CASE_SEEDS, type CaseDto } from '@card-game/shared-types';

import type { SessionExpedition, SessionExpeditionKind } from './sessionExpedition';
import { ASHEN_WASTES_EXPEDITION } from './sessionExpedition';

interface ExpeditionPanelProps {
  cases: CaseDto[];
  completed: SessionExpedition | null;
  onStart: (expedition: SessionExpedition) => void;
}

const EXPEDITION_COPY: Record<SessionExpeditionKind, { title: string; description: string }> = {
  'ashen-wastes': {
    title: 'Follow the Cinders',
    description: 'Open Cinderbound Cache and add to the Ashen Wastes set.',
  },
  'widen-archive': {
    title: 'Widen the Archive',
    description: 'Choose an existing case to broaden your global collection.',
  },
};

/** A choice prompt, not a task ledger; it never grants a reward or blocks the lobby. */
export function ExpeditionPanel({ cases, completed, onStart }: ExpeditionPanelProps) {
  const [selected, setSelected] = useState<SessionExpeditionKind | null>(null);
  const globalCases = useMemo(
    () => cases.filter((caseDto) => CASE_SEEDS.find((seed) => seed.slug === caseDto.slug)?.setId === null),
    [cases],
  );

  return (
    <section aria-labelledby="expeditions-heading" className="mx-auto w-full max-w-5xl rounded-xl border border-amber-400/30 bg-amber-400/5 p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-300">Optional session direction</p>
          <h2 id="expeditions-heading" className="mt-1 text-xl font-bold text-neutral-100">Expeditions</h2>
        </div>
        {completed && <span className="rounded-full border border-emerald-400/40 bg-emerald-400/10 px-3 py-1 text-xs font-semibold text-emerald-300">Expedition complete</span>}
      </div>

      <p className="mt-2 max-w-2xl text-sm text-neutral-400">Pick a direction for this session, or ignore it and open any case as usual.</p>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {(Object.keys(EXPEDITION_COPY) as SessionExpeditionKind[]).map((kind) => {
          const copy = EXPEDITION_COPY[kind];
          const isSelected = selected === kind;
          return (
            <button key={kind} type="button" aria-pressed={isSelected} onClick={() => setSelected(kind)} className={`rounded-lg border p-4 text-left transition-colors ${isSelected ? 'border-amber-300 bg-amber-400/10 shadow-[0_0_24px_-12px_rgba(251,191,36,0.9)]' : 'border-neutral-700 bg-neutral-900/70 hover:border-neutral-500'}`}>
              <span className="block font-semibold text-neutral-100">{copy.title}</span>
              <span className="mt-1 block text-sm text-neutral-400">{copy.description}</span>
            </button>
          );
        })}
      </div>

      {selected === 'ashen-wastes' && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-neutral-700 bg-neutral-900/80 p-3">
          <span className="text-sm text-neutral-300">Your next case: Cinderbound Cache</span>
          <button type="button" onClick={() => onStart(ASHEN_WASTES_EXPEDITION)} className="rounded-md bg-amber-400 px-3 py-1.5 text-sm font-semibold text-neutral-950">Open Cinderbound Cache</button>
        </div>
      )}

      {selected === 'widen-archive' && (
        <div className="mt-4 rounded-lg border border-neutral-700 bg-neutral-900/80 p-3">
          <p className="text-sm text-neutral-300">Choose a case for your global collection:</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {globalCases.map((caseDto) => (
              <button key={caseDto.slug} type="button" onClick={() => onStart({ kind: 'widen-archive', caseSlug: caseDto.slug })} className="rounded-md border border-neutral-600 px-3 py-1.5 text-sm text-neutral-200 transition-colors hover:border-amber-300 hover:text-amber-200">{caseDto.name}</button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
