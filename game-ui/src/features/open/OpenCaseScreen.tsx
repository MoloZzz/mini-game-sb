import { useCallback, useEffect, useRef, useState } from 'react';
import type { OpenCaseResponse } from '@card-game/shared-types';

import { Button } from '@/components/Button';
import { useToast } from '@/components/Toast';
import { newIdempotencyKey, openCase } from '@/lib/api';
import { ApiClientError, isApiErrorCode, USER_MESSAGES } from '@/lib/apiError';
import { Reel } from '@/features/reel/Reel';
import { Reveal } from '@/features/reveal/Reveal';
import type { SessionExpedition } from '@/features/expeditions/sessionExpedition';
import { expeditionCollectionLabel } from '@/features/expeditions/sessionExpedition';

export interface OpenCaseScreenProps {
  slug: string;
  caseName?: string;
  onBackToLobby: () => void;
  onToInventory: () => void;
  /** Optional browser-memory-only session objective selected from the lobby. */
  expedition?: SessionExpedition | null;
  onExpeditionComplete?: () => void;
  onToExpeditionCollection?: () => void;
  /** Fires with the post-opening balance so an outer shell can stay in sync. */
  onBalanceChange?: (balance: OpenCaseResponse['balance']) => void;
}

type Phase =
  | { kind: 'requesting' }
  | { kind: 'spinning'; result: OpenCaseResponse }
  | { kind: 'revealed'; result: OpenCaseResponse }
  | { kind: 'failed'; message: string };

function errorMessage(err: unknown): string {
  if (err instanceof ApiClientError) {
    return isApiErrorCode(err.code) ? USER_MESSAGES[err.code] : err.message;
  }
  return 'Something went wrong.';
}

/**
 * The ONE place in the app that calls POST /cases/:slug/open. Keeping it
 * single-sited is what makes "the button is disabled for the whole cycle"
 * and the Idempotency-Key actually mean something — a second entry point
 * would silently reintroduce the double-open bug.
 */
export function OpenCaseScreen({
  slug,
  caseName,
  onBackToLobby,
  onToInventory,
  expedition = null,
  onExpeditionComplete,
  onToExpeditionCollection,
  onBalanceChange,
}: OpenCaseScreenProps) {
  const [attempt, setAttempt] = useState(0);
  const [phase, setPhase] = useState<Phase>({ kind: 'requesting' });
  const toast = useToast();

  // React 18 StrictMode mounts effects twice in development, which would debit
  // the player twice for one click. `startedRef` makes the request fire once
  // per attempt; staleness is then decided by comparing against `currentKeyRef`
  // rather than by a per-closure `cancelled` flag — a cancel-on-cleanup flag
  // would mark StrictMode's *first* (and only) request as abandoned and the
  // reel would never start.
  const startedRef = useRef<string | null>(null);
  const currentKeyRef = useRef<string>('');
  const expeditionCompletedRef = useRef(false);
  const mountedRef = useRef(true);
  const onBalanceChangeRef = useRef(onBalanceChange);
  onBalanceChangeRef.current = onBalanceChange;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    expeditionCompletedRef.current = false;
  }, [expedition?.caseSlug, expedition?.kind]);

  useEffect(() => {
    const attemptKey = `${slug}#${attempt}`;
    currentKeyRef.current = attemptKey;
    if (startedRef.current === attemptKey) return;
    startedRef.current = attemptKey;

    const isCurrent = () => mountedRef.current && currentKeyRef.current === attemptKey;
    setPhase({ kind: 'requesting' });

    openCase(slug, undefined, newIdempotencyKey())
      .then((result) => {
        if (!isCurrent()) return;
        onBalanceChangeRef.current?.(result.balance);
        setPhase({ kind: 'spinning', result });
      })
      .catch((err: unknown) => {
        if (!isCurrent()) return;
        // The server rolls the whole opening back on failure, so no funds
        // were lost and offering a retry is safe.
        const message = errorMessage(err);
        setPhase({ kind: 'failed', message });
        toast.push(message, 'error');
      });
    // `toast` is stable from the provider; re-running on it would restart the opening.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, attempt]);

  const handleLanded = useCallback(() => {
    setPhase((current) =>
      current.kind === 'spinning' ? { kind: 'revealed', result: current.result } : current,
    );
    if (expedition && !expeditionCompletedRef.current) {
      expeditionCompletedRef.current = true;
      onExpeditionComplete?.();
    }
  }, [expedition, onExpeditionComplete]);

  const handleAgain = useCallback(() => setAttempt((n) => n + 1), []);

  const busy = phase.kind === 'requesting' || phase.kind === 'spinning';
  const result = phase.kind === 'spinning' || phase.kind === 'revealed' ? phase.result : null;

  return (
    // Full focus: the lobby is gone, the background is flat black. Everything
    // on this screen is a wrapper around the 5.5 seconds in the middle.
    <div className="flex min-h-screen flex-col items-center justify-center gap-8 bg-neutral-950 px-4 py-10 text-neutral-100">
      <div className="flex w-full max-w-5xl flex-col items-center gap-2">
        <p className="text-sm uppercase tracking-widest text-neutral-500">
          {caseName ?? slug}
        </p>
      </div>

      {phase.kind !== 'revealed' && (
        <div className="w-full max-w-5xl">
          <Reel
            reel={phase.kind === 'spinning' ? phase.result.reel : null}
            spinId={phase.kind === 'spinning' ? phase.result.dropId : null}
            onLanded={handleLanded}
          />
          {phase.kind === 'requesting' && (
            <p className="mt-4 text-center text-sm text-neutral-500">Opening…</p>
          )}
        </div>
      )}

      {phase.kind === 'revealed' && result && (
        <Reveal
          result={result}
          caseName={caseName}
          onAgain={handleAgain}
          onToInventory={onToInventory}
          againDisabled={busy}
          expeditionComplete={Boolean(expedition)}
          expeditionCollectionLabel={expedition ? expeditionCollectionLabel(expedition) : undefined}
          onToExpeditionCollection={expedition ? onToExpeditionCollection : undefined}
        />
      )}

      {phase.kind === 'failed' && (
        <div className="flex flex-col items-center gap-4">
          <p className="text-sm text-red-300">{phase.message}</p>
          <div className="flex gap-3">
            <Button variant="primary" size="md" onClick={handleAgain}>
              Try again
            </Button>
            <Button variant="secondary" size="md" onClick={onBackToLobby}>
              Back to lobby
            </Button>
          </div>
        </div>
      )}

      {phase.kind !== 'failed' && (
        <Button variant="ghost" size="sm" onClick={onBackToLobby} disabled={busy}>
          Back to lobby
        </Button>
      )}
    </div>
  );
}
