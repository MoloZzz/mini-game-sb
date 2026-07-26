import { useCallback, useState } from 'react';
import { RARITY_META, type OpenCaseResponse } from '@card-game/shared-types';

import { newIdempotencyKey, openCase } from '@/lib/api';
import { ApiClientError, isApiErrorCode, USER_MESSAGES } from '@/lib/apiError';

import { Reel, type ReelDebugInfo } from './Reel';

const CASE_SLUGS = ['starter-chest', 'ember-vault', 'arcane-reliquary'] as const;
type CaseSlug = (typeof CASE_SLUGS)[number];

interface SpinState {
  spinId: string;
  reel: OpenCaseResponse['reel'];
}

function errorMessage(err: unknown): string {
  if (err instanceof ApiClientError) {
    return isApiErrorCode(err.code) ? USER_MESSAGES[err.code] : err.message;
  }
  return 'Something went wrong.';
}

export function ReelSandbox() {
  const [slug, setSlug] = useState<CaseSlug>('starter-chest');
  const [spin, setSpin] = useState<SpinState | null>(null);
  // The result only reaches the screen once the reel has actually landed —
  // the reel decides nothing, but the reveal still waits for its "beat".
  const [pendingResult, setPendingResult] = useState<OpenCaseResponse | null>(null);
  const [result, setResult] = useState<OpenCaseResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [forceReducedMotion, setForceReducedMotion] = useState(false);
  const [debug, setDebug] = useState<ReelDebugInfo | null>(null);

  const handleSpin = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    setResult(null);

    try {
      const response = await openCase(slug, undefined, newIdempotencyKey());
      setPendingResult(response);
      setSpin({ spinId: response.dropId, reel: response.reel });
    } catch (err) {
      // The server rolled the transaction back on failure — no funds were
      // lost, so re-enabling the button here is safe.
      setBusy(false);
      setError(errorMessage(err));
    }
  }, [busy, slug]);

  const handleLanded = useCallback(() => {
    setResult(pendingResult);
    setPendingResult(null);
    setBusy(false);
  }, [pendingResult]);

  return (
    <div className="flex min-h-screen flex-col items-center bg-neutral-950 px-6 py-10 text-neutral-100">
      <div className="flex w-full max-w-3xl flex-col items-center gap-6">
        <h1 className="text-2xl font-bold">Reel Sandbox</h1>

        <div className="flex gap-2">
          {CASE_SLUGS.map((s) => (
            <button
              key={s}
              type="button"
              disabled={busy}
              onClick={() => setSlug(s)}
              className={`rounded-md border px-4 py-2 text-sm transition-colors ${
                s === slug
                  ? 'border-amber-400 bg-amber-400/10 text-amber-300'
                  : 'border-neutral-700 text-neutral-300 hover:border-neutral-500'
              } disabled:cursor-not-allowed disabled:opacity-50`}
            >
              {s}
            </button>
          ))}
        </div>

        {error && (
          <div className="w-full rounded-md border border-red-500/50 bg-red-500/10 px-4 py-2 text-sm text-red-300">
            {error}
          </div>
        )}

        <Reel
          reel={spin?.reel ?? null}
          spinId={spin?.spinId ?? null}
          onLanded={handleLanded}
          forceReducedMotion={forceReducedMotion}
          onDebug={setDebug}
          className="max-w-3xl"
        />

        <button
          type="button"
          disabled={busy}
          onClick={() => void handleSpin()}
          className="rounded-lg bg-amber-400 px-10 py-3 text-lg font-bold text-neutral-950 transition-opacity disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? 'Spinning…' : 'SPIN'}
        </button>

        <label className="flex items-center gap-2 text-sm text-neutral-400">
          <input
            type="checkbox"
            checked={forceReducedMotion}
            onChange={(e) => setForceReducedMotion(e.target.checked)}
          />
          Force reduced motion (skip path)
        </label>

        {result && (
          <div className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-4 py-4 text-center">
            <p className="text-lg font-semibold" style={{ color: RARITY_META[result.wonCard.rarity].color }}>
              {result.wonCard.name} · {result.wonCard.rarity}
            </p>
            <p className="mt-1 text-sm text-neutral-300">
              ATK {result.wonCard.attack} / DEF {result.wonCard.defense}
            </p>
            <p className="mt-1 text-sm text-neutral-400">
              {result.isDuplicate ? `×${result.copies}` : 'NEW'}
            </p>
            <p className="mt-1 text-xs text-neutral-500">
              Balance: {result.balance.coins} coins, {result.balance.keys} keys
            </p>
          </div>
        )}

        <div className="w-full rounded-md border border-neutral-800 bg-neutral-900/50 px-4 py-2 text-xs text-neutral-500">
          <p>phase: {debug?.phase ?? 'idle'}</p>
          <p>containerW: {debug?.containerW ?? '—'}</p>
          <p>jitter: {debug?.jitter !== undefined ? `${debug.jitter.toFixed(1)}px` : '—'}</p>
          <p>target: {debug?.target !== undefined ? `${debug.target.toFixed(1)}px` : '—'}</p>
        </div>
      </div>
    </div>
  );
}
