import { useCallback, useEffect, useRef, useState } from 'react';
import {
  GENERATION_ORDER_STATUSES,
  type GenerationOrderDto,
  type GenerationOrderStatus,
} from '@card-game/shared-types';

import { Button } from '@/components/Button';
import { Chip } from '@/components/ui/Chip';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { Modal } from '@/components/ui/Modal';
import { Pagination } from '@/components/ui/Pagination';
import { Panel } from '@/components/ui/Panel';
import {
  cancelGenerationOrder,
  createGenerationOrder,
  getGenerationOrders,
  queueGenerationOrder,
  regenerateGenerationOrder,
  retryGenerationOrder,
  updateGenerationOrder,
} from '@/lib/api';
import { ApiClientError } from '@/lib/apiError';

import { GenerationOrderCard } from './GenerationOrderCard';
import {
  EMPTY_ORDER_FORM,
  GenerationOrderForm,
  orderToFormValue,
  type GenerationOrderFormValue,
} from './GenerationOrderForm';

const PAGE_SIZE = 20;
const ALL = 'all';
type StatusFilter = GenerationOrderStatus | typeof ALL;

function messageFor(error: unknown, fallback: string): string {
  return error instanceof ApiClientError ? error.message : fallback;
}

function sameCandidates(left: GenerationOrderDto, right: GenerationOrderDto): boolean {
  return left.candidates.every((candidate, index) => {
    const other = right.candidates[index]!;
    return candidate.id === other.id &&
      candidate.index === other.index &&
      candidate.slug === other.slug &&
      candidate.seed === other.seed &&
      candidate.status === other.status &&
      candidate.cardId === other.cardId &&
      candidate.thumbUrl === other.thumbUrl &&
      candidate.cardName === other.cardName;
  });
}

function sameOrder(left: GenerationOrderDto, right: GenerationOrderDto): boolean {
  if (
    left.id !== right.id ||
    left.status !== right.status ||
    left.title !== right.title ||
    left.brief !== right.brief ||
    left.archetype !== right.archetype ||
    left.element !== right.element ||
    left.suggestedRarity !== right.suggestedRarity ||
    left.candidateCount !== right.candidateCount ||
    left.setId !== right.setId ||
    left.recipeProfile !== right.recipeProfile ||
    left.createdByPlayerId !== right.createdByPlayerId ||
    left.createdAt !== right.createdAt ||
    left.readyAt !== right.readyAt ||
    left.generatedAt !== right.generatedAt ||
    left.completedAt !== right.completedAt ||
    left.failureCode !== right.failureCode ||
    left.failureDetail !== right.failureDetail ||
    left.candidates.length !== right.candidates.length
  ) {
    return false;
  }

  return sameCandidates(left, right);
}

/**
 * A poll every five seconds must not re-render every row. Returns the previous
 * array when nothing changed, and otherwise reuses the previous object for each
 * order that is individually unchanged, so `GenerationOrderCard`'s memo holds.
 */
export function reconcileGenerationOrders(
  previous: GenerationOrderDto[],
  next: GenerationOrderDto[],
): GenerationOrderDto[] {
  if (previous.length === next.length && previous.every((order, index) => sameOrder(order, next[index]!))) {
    return previous;
  }

  const previousById = new Map(previous.map((order) => [order.id, order]));
  return next.map((order) => {
    const existing = previousById.get(order.id);
    return existing && sameOrder(existing, order) ? existing : order;
  });
}

/** Operator-facing work queue; the local Forge worker processes queued orders. */
export function GenerationOrders() {
  const [form, setForm] = useState<GenerationOrderFormValue>(EMPTY_ORDER_FORM);
  const [orders, setOrders] = useState<GenerationOrderDto[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<StatusFilter>(ALL);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [pendingIds, setPendingIds] = useState<ReadonlySet<string>>(() => new Set());
  const [editing, setEditing] = useState<GenerationOrderDto | null>(null);
  const [editForm, setEditForm] = useState<GenerationOrderFormValue>(EMPTY_ORDER_FORM);
  const latestLoadRef = useRef(0);

  const invalidatePendingLoads = useCallback(() => {
    latestLoadRef.current += 1;
  }, []);

  const load = useCallback(async () => {
    const loadId = latestLoadRef.current + 1;
    latestLoadRef.current = loadId;
    try {
      const next = await getGenerationOrders({
        status: status === ALL ? undefined : status,
        page,
        limit: PAGE_SIZE,
      });
      if (latestLoadRef.current !== loadId) return;
      setOrders((previous) => reconcileGenerationOrders(previous, next.items));
      setTotal(next.total);
    } catch {
      if (latestLoadRef.current === loadId) setError('Could not load generation orders.');
    } finally {
      if (latestLoadRef.current === loadId) setLoading(false);
    }
  }, [page, status]);

  useEffect(() => {
    let refreshId: number | undefined;

    const stopPolling = () => {
      if (refreshId !== undefined) {
        window.clearInterval(refreshId);
        refreshId = undefined;
      }
      // The API client does not currently expose AbortSignal. Invalidating the
      // request has the same UI effect: a response that arrives after hiding
      // the tab or unmounting cannot set state.
      invalidatePendingLoads();
    };
    const poll = () => {
      if (!document.hidden) void load();
    };
    const startPolling = () => {
      if (document.hidden || refreshId !== undefined) return;
      refreshId = window.setInterval(poll, 5_000);
    };
    const onVisibilityChange = () => {
      if (document.hidden) stopPolling();
      else {
        poll();
        startPolling();
      }
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    // The FIRST load is unconditional; only the repeat poll waits on
    // visibility. Mounting in a background tab used to skip the fetch
    // entirely, leaving the queue on its skeletons until the tab was focused.
    void load();
    startPolling();
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      stopPolling();
    };
  }, [invalidatePendingLoads, load]);

  /** One in-flight action per order, so a second click cannot fire a second request. */
  const runAction = useCallback(
    async (id: string, action: (id: string) => Promise<unknown>, fallback: string) => {
      setPendingIds((previous) => new Set(previous).add(id));
      setError(null);
      try {
        await action(id);
        await load();
      } catch (actionError) {
        setError(messageFor(actionError, fallback));
      } finally {
        setPendingIds((previous) => {
          const next = new Set(previous);
          next.delete(id);
          return next;
        });
      }
    },
    [load],
  );

  const create = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      await createGenerationOrder({ ...form, setId: null });
      setForm(EMPTY_ORDER_FORM);
      await load();
    } catch (createError) {
      setError(messageFor(createError, 'Could not create the generation order.'));
    } finally {
      setSaving(false);
    }
  }, [form, load]);

  const saveEdit = useCallback(async () => {
    if (!editing) return;
    setSaving(true);
    setError(null);
    try {
      await updateGenerationOrder(editing.id, { ...editForm, setId: null });
      setEditing(null);
      await load();
    } catch (editError) {
      setError(messageFor(editError, 'Could not update the generation order.'));
    } finally {
      setSaving(false);
    }
  }, [editForm, editing, load]);

  const queue = useCallback(
    (id: string) => void runAction(id, queueGenerationOrder, 'Could not queue the generation order.'),
    [runAction],
  );
  const retry = useCallback(
    (id: string) => void runAction(id, retryGenerationOrder, 'Could not retry the generation order.'),
    [runAction],
  );
  const regenerate = useCallback(
    (id: string) => void runAction(id, regenerateGenerationOrder, 'Could not regenerate the generation order.'),
    [runAction],
  );
  const cancel = useCallback(
    (id: string) => void runAction(id, cancelGenerationOrder, 'Could not cancel the generation order.'),
    [runAction],
  );
  const startEdit = useCallback((order: GenerationOrderDto) => {
    setEditing(order);
    setEditForm(orderToFormValue(order));
  }, []);

  const changeStatus = (next: StatusFilter) => {
    setStatus(next);
    setPage(1);
    setLoading(true);
  };
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <main className="mx-auto max-w-5xl p-6">
      <h1 className="text-2xl font-bold">Generation orders</h1>
      <p className="mt-1 text-sm text-neutral-400">
        Creates offline Forge work. The local worker processes queued orders; Stable Diffusion never runs in the game server.
      </p>
      <div aria-live="polite">{error && <ErrorBanner className="mt-4">{error}</ErrorBanner>}</div>

      <Panel className="mt-6">
        <GenerationOrderForm
          value={form}
          onChange={setForm}
          onSubmit={() => void create()}
          submitting={saving}
          submitLabel="Create draft order"
        />
      </Panel>

      <section className="mt-6 w-full" aria-busy={loading}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Queue</h2>
          <p className="text-xs text-neutral-500">{total} total</p>
        </div>
        <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Filter orders by status">
          <Chip active={status === ALL} onClick={() => changeStatus(ALL)}>
            all
          </Chip>
          {GENERATION_ORDER_STATUSES.map((value) => (
            <Chip key={value} active={status === value} onClick={() => changeStatus(value)}>
              {value}
            </Chip>
          ))}
        </div>

        <div className="mt-3 grid gap-3">
          {loading && orders.length === 0 ? (
            Array.from({ length: 3 }, (_, index) => (
              <Panel key={index} muted className="h-28 animate-pulse" />
            ))
          ) : orders.length === 0 ? (
            <EmptyState>
              <p>No orders {status === ALL ? 'yet' : `with status “${status}”`}.</p>
              <p className="text-neutral-500">Describe the art you want above and create a draft order.</p>
            </EmptyState>
          ) : (
            orders.map((order) => (
              <GenerationOrderCard
                key={order.id}
                order={order}
                pending={pendingIds.has(order.id)}
                onQueue={queue}
                onRetry={retry}
                onRegenerate={regenerate}
                onCancel={cancel}
                onEdit={startEdit}
              />
            ))
          )}
        </div>

        {totalPages > 1 && (
          <Pagination
            className="mt-4"
            page={page}
            totalPages={totalPages}
            onPageChange={(next) => {
              setPage(next);
              setLoading(true);
            }}
          />
        )}
      </section>

      {editing && (
        <Modal label={`Edit generation order ${editing.title}`} size="lg" onClose={() => setEditing(null)}>
          <h2 className="mb-4 text-lg font-semibold">Edit draft order</h2>
          <GenerationOrderForm
            value={editForm}
            onChange={setEditForm}
            onSubmit={() => void saveEdit()}
            submitting={saving}
            submitLabel="Save changes"
            secondaryAction={
              <Button type="button" variant="secondary" onClick={() => setEditing(null)}>
                Discard changes
              </Button>
            }
          />
        </Modal>
      )}
    </main>
  );
}
