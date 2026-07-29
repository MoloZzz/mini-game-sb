import { useCallback, useRef, useState } from 'react';
import type { OpenArchivePassResponse } from '@card-game/shared-types';

import { Button } from '@/components/Button';
import { Reel } from '@/features/reel/Reel';
import { Reveal } from '@/features/reveal/Reveal';
import { ApiClientError, isApiErrorCode, USER_MESSAGES } from '@/lib/apiError';
import { newIdempotencyKey, openArchivePass } from '@/lib/api';

interface OpenArchivePassScreenProps {
  passId: string;
  onBackToArchive: () => void;
  onToInventory: () => void;
}

type Phase =
  | { kind: 'ready' }
  | { kind: 'requesting' }
  | { kind: 'spinning'; result: OpenArchivePassResponse }
  | { kind: 'revealed'; result: OpenArchivePassResponse }
  | { kind: 'failed'; message: string };

function errorMessage(error: unknown): string {
  if (error instanceof ApiClientError && isApiErrorCode(error.code)) return USER_MESSAGES[error.code];
  return 'Could not open this Archive Pass.';
}

/** A pass has its own server endpoint, but the reward keeps the familiar reel and reveal payoff. */
export function OpenArchivePassScreen({ passId, onBackToArchive, onToInventory }: OpenArchivePassScreenProps) {
  const [phase, setPhase] = useState<Phase>({ kind: 'ready' });
  const idempotencyKeyRef = useRef<string | null>(null);

  const openPass = useCallback(async () => {
    if (phase.kind !== 'ready' && phase.kind !== 'failed') return;
    setPhase({ kind: 'requesting' });
    try {
      idempotencyKeyRef.current ??= newIdempotencyKey();
      setPhase({ kind: 'spinning', result: await openArchivePass(passId, idempotencyKeyRef.current) });
    } catch (reason) {
      setPhase({ kind: 'failed', message: errorMessage(reason) });
    }
  }, [passId, phase.kind]);

  const handleLanded = useCallback(() => {
    setPhase((current) => current.kind === 'spinning' ? { kind: 'revealed', result: current.result } : current);
  }, []);

  if (phase.kind === 'revealed') {
    return (
      <Reveal
        result={phase.result}
        caseName="Archive Cache"
        onAgain={onBackToArchive}
        againLabel="Back to Archive Notes"
        onToInventory={onToInventory}
      />
    );
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 bg-neutral-950 px-6 py-10 text-neutral-100">
      <div className="text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-300">Archive Pass</p>
        <h1 className="mt-1 text-2xl font-bold">Archive Cache</h1>
        <p className="mt-2 max-w-md text-sm text-neutral-400">Open this pass to reveal one card. It does not cost coins or keys.</p>
      </div>

      {phase.kind === 'spinning' && <Reel reel={phase.result.reel} spinId={phase.result.dropId} onLanded={handleLanded} />}
      {phase.kind === 'requesting' && <p className="text-sm text-neutral-500">Opening…</p>}
      {phase.kind === 'failed' && <p role="alert" className="text-sm text-red-300">{phase.message}</p>}

      {phase.kind !== 'spinning' && phase.kind !== 'requesting' && (
        <div className="flex gap-3">
          <Button onClick={() => void openPass()}>{phase.kind === 'failed' ? 'Try again' : 'Open Archive Cache'}</Button>
          <Button variant="secondary" onClick={onBackToArchive}>Back to Archive Notes</Button>
        </div>
      )}
    </main>
  );
}
