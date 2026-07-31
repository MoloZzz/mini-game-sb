import { memo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { GenerationCandidateStatus, GenerationOrderDto, GenerationOrderStatus } from '@card-game/shared-types';

import { Button } from '@/components/Button';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { ImgWithFallback } from '@/components/ui/ImgWithFallback';
import { Panel } from '@/components/ui/Panel';

/**
 * Colour alone never carries the state — every row spells the status out and
 * adds a sentence saying what happens next, because "amber" means nothing to
 * an operator returning to this screen after a week.
 */
const STATUS_META: Readonly<Record<GenerationOrderStatus, { label: string; tone: string; hint: string }>> = {
  draft: { label: 'Draft', tone: 'border-neutral-600 text-neutral-300', hint: 'Not queued yet — edit freely.' },
  ready: { label: 'Queued', tone: 'border-amber-500/60 text-amber-300', hint: 'Waiting for the local Forge worker to claim it.' },
  generating: { label: 'Generating', tone: 'border-sky-500/60 text-sky-300', hint: 'Forge is rendering the candidates.' },
  review: { label: 'Awaiting review', tone: 'border-emerald-500/60 text-emerald-300', hint: 'Pick a winner in Review, or regenerate the whole crop.' },
  completed: { label: 'Completed', tone: 'border-emerald-600/60 text-emerald-400', hint: 'A candidate was approved and the rest were rejected.' },
  failed: { label: 'Failed', tone: 'border-red-500/60 text-red-300', hint: 'Retry replays the same seeds; regenerate rolls new ones.' },
  cancelled: { label: 'Cancelled', tone: 'border-neutral-700 text-neutral-500', hint: 'Closed without producing a card.' },
};

const CANDIDATE_LABEL: Readonly<Record<GenerationCandidateStatus, string>> = {
  planned: 'planned',
  generated: 'generated',
  selected: 'selected',
  discarded: 'discarded',
};

export interface GenerationOrderCardProps {
  order: GenerationOrderDto;
  /** True while any action for this order is in flight — the double-click guard. */
  pending: boolean;
  onQueue: (id: string) => void;
  onRetry: (id: string) => void;
  onRegenerate: (id: string) => void;
  onCancel: (id: string) => void;
  onEdit: (order: GenerationOrderDto) => void;
}

function CandidateStrip({ order }: { order: GenerationOrderDto }) {
  return (
    <div className="mt-4 border-t border-neutral-800 pt-3">
      <p className="text-xs uppercase tracking-wide text-neutral-500">Candidates</p>
      <ul className="mt-2 flex flex-wrap gap-3">
        {order.candidates.map((candidate) => (
          <li key={candidate.id} className="w-20 text-center">
            {candidate.thumbUrl ? (
              <ImgWithFallback
                key={candidate.id}
                src={candidate.thumbUrl}
                alt={candidate.cardName ?? `Candidate ${candidate.index}`}
                className="h-20 w-20 rounded object-cover"
              />
            ) : (
              <div className="flex h-20 w-20 items-center justify-center rounded border border-dashed border-neutral-700 text-sm text-neutral-600">
                {candidate.index}
              </div>
            )}
            <p className="mt-1 truncate text-xs text-neutral-400" title={candidate.slug}>
              {CANDIDATE_LABEL[candidate.status]}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}

export const GenerationOrderCard = memo(function GenerationOrderCard({
  order,
  pending,
  onQueue,
  onRetry,
  onRegenerate,
  onCancel,
  onEdit,
}: GenerationOrderCardProps) {
  // Cancelling from `review` rejects every generated card, which no button
  // undoes — so the first click only arms the second.
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const meta = STATUS_META[order.status];
  const cancellable = order.status === 'draft' || order.status === 'ready' || order.status === 'review';

  return (
    // Labelled as an article so each order is one navigable landmark rather
    // than an undifferentiated run of text in the queue.
    <Panel role="article" aria-label={order.title} className="w-full overflow-hidden">
      <div className="flex flex-wrap items-start gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="break-words font-medium">{order.title}</p>
            <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${meta.tone}`}>
              {meta.label}
            </span>
          </div>
          <p className="mt-1 break-words text-sm text-neutral-400">{order.brief}</p>
          <p className="mt-1 break-words text-xs text-neutral-500">
            {order.candidateCount} candidates &middot; {order.suggestedRarity} {order.archetype}
            {order.element ? ` · ${order.element}` : ''}
          </p>
          <p className="mt-1 text-xs text-neutral-500">{meta.hint}</p>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {order.status === 'draft' && (
            <>
              <Button size="sm" variant="secondary" disabled={pending} onClick={() => onEdit(order)}>
                Edit
              </Button>
              <Button size="sm" disabled={pending} onClick={() => onQueue(order.id)}>
                Queue for Forge
              </Button>
            </>
          )}
          {order.status === 'review' && (
            <Link
              to="/admin"
              className="rounded-md border border-neutral-700 px-3 py-1.5 text-sm text-neutral-300 hover:border-neutral-500 hover:text-neutral-100"
            >
              Open in Review
            </Link>
          )}
          {order.status === 'failed' && (
            <Button size="sm" variant="secondary" disabled={pending} onClick={() => onRetry(order.id)}>
              Retry same seeds
            </Button>
          )}
          {(order.status === 'failed' || order.status === 'review') && (
            <Button size="sm" disabled={pending} onClick={() => onRegenerate(order.id)}>
              Regenerate
            </Button>
          )}
          {cancellable &&
            (confirmingCancel ? (
              <Button
                size="sm"
                variant="danger"
                disabled={pending}
                onClick={() => {
                  setConfirmingCancel(false);
                  onCancel(order.id);
                }}
              >
                Confirm cancel
              </Button>
            ) : (
              <Button size="sm" variant="ghost" disabled={pending} onClick={() => setConfirmingCancel(true)}>
                Cancel
              </Button>
            ))}
        </div>
      </div>

      {order.failureCode && (
        <ErrorBanner className="mt-3">
          <span className="font-semibold">{order.failureCode}</span>
          {order.failureDetail ? ` — ${order.failureDetail}` : ''}
        </ErrorBanner>
      )}

      {order.candidates.length > 0 && <CandidateStrip order={order} />}
    </Panel>
  );
});
