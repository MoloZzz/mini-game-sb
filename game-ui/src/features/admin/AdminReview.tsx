import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CARD_STATUSES,
  RARITIES,
  type AdminCardDto,
  type CardStatus,
  type ReviewCardRequest,
} from '@card-game/shared-types';

import { getAdminCards, reviewCard, selectGenerationOrderCandidate } from '@/lib/api';
import { ApiClientError, isApiErrorCode, USER_MESSAGES } from '@/lib/apiError';

import { CardReviewPanel } from './CardReviewPanel';
import { Button } from '@/components/Button';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { ImgWithFallback } from '@/components/ui/ImgWithFallback';
import { Modal } from '@/components/ui/Modal';
import { rarityColor, rarityTint } from '@/lib/rarityStyle';
import { useReviewKeyboard, type ReviewKeyboardHandlers } from './useReviewKeyboard';

// The API contract example uses limit=40; large enough that the ~24-card mock
// pool always fits on page 1, but still a real page size for a pool sized in
// the hundreds.
const PAGE_SIZE = 40;
const CHEATSHEET_SEEN_KEY = 'admin-review-cheatsheet-seen';

type StatusFilter = CardStatus | 'all';
const STATUS_FILTERS: StatusFilter[] = ['all', ...CARD_STATUSES];

function errorMessage(err: unknown): string {
  if (err instanceof ApiClientError) {
    return isApiErrorCode(err.code) ? USER_MESSAGES[err.code] : err.message;
  }
  return 'Something went wrong.';
}

function editsFromCard(card: AdminCardDto): ReviewCardRequest {
  return {
    name: card.name,
    rarity: card.rarity,
    element: card.element,
    archetype: card.archetype,
    attack: card.attack,
    defense: card.defense,
    flavorText: card.flavorText,
  };
}

function generationOrderId(card: AdminCardDto): string | null {
  const source = card.genMeta.generationOrder;
  if (typeof source !== 'object' || source === null) return null;
  const value = (source as Record<string, unknown>).orderId;
  return typeof value === 'string' ? value : null;
}

function hasSeenCheatSheet(): boolean {
  try {
    return window.localStorage.getItem(CHEATSHEET_SEEN_KEY) === '1';
  } catch {
    // Storage can be unavailable (private browsing, disabled cookies) —
    // default to showing the sheet rather than crashing the screen over it.
    return false;
  }
}

function markCheatSheetSeen(): void {
  try {
    window.localStorage.setItem(CHEATSHEET_SEEN_KEY, '1');
  } catch {
    // best effort only
  }
}

interface StatusCounts {
  draft: number;
  approved: number;
  rejected: number;
  all: number;
}

const ZERO_COUNTS: StatusCounts = { draft: 0, approved: 0, rejected: 0, all: 0 };

interface AdminReviewTileProps {
  card: AdminCardDto;
  focused: boolean;
  pending: boolean;
  onFocus: (id: string) => void;
  onRefChange: (id: string, element: HTMLDivElement | null) => void;
}

/**
 * A review list can grow to hundreds of cards. The parent owns focus, edits
 * and optimistic state, but a change to any of those must not re-render every
 * tile. Unchanged card objects stay referentially stable in every update path,
 * so memoization limits the work to the previous/current focus and the card
 * being reviewed. content-visibility also lets the browser defer off-screen
 * paint while preserving the real DOM required by keyboard navigation.
 */
const AdminReviewTile = memo(function AdminReviewTile({
  card,
  focused,
  pending,
  onFocus,
  onRefChange,
}: AdminReviewTileProps) {
  const setRef = useCallback(
    (element: HTMLDivElement | null) => onRefChange(card.id, element),
    [card.id, onRefChange],
  );
  const focus = useCallback(() => onFocus(card.id), [card.id, onFocus]);

  return (
    <div
      ref={setRef}
      data-testid={`admin-tile-${card.id}`}
      data-focused={focused ? 'true' : 'false'}
      data-status={card.status}
      onClick={focus}
      className={`flex cursor-pointer flex-col gap-1 rounded-md border-2 bg-neutral-900 p-1.5 transition-opacity ${
        focused ? 'ring-2 ring-amber-400' : ''
      } ${pending ? 'opacity-50' : ''}`}
      style={{
        borderColor: rarityColor(card.rarity),
        contentVisibility: 'auto',
        containIntrinsicSize: '160px',
      }}
    >
      <ImgWithFallback
        src={card.thumbUrl}
        alt={card.name}
        fallbackColor={rarityTint(card.rarity, 'fallback')}
        className="aspect-square w-full rounded object-cover"
      />
      <p className="truncate text-xs font-medium text-neutral-100">{card.name}</p>
      <span
        className={`w-fit rounded px-1 text-[10px] font-semibold uppercase ${
          card.status === 'approved'
            ? 'bg-emerald-500/20 text-emerald-400'
            : card.status === 'rejected'
              ? 'bg-red-500/20 text-red-400'
              : 'bg-neutral-700 text-neutral-300'
        }`}
      >
        {card.status}
      </span>
    </div>
  );
});

/**
 * The admin contact sheet (B6). Generation is ~45 minutes for ~283 cards;
 * manual review measures out as *longer than generation itself* (ADR-013),
 * so every choice here is in service of one hand staying on the keyboard —
 * see useReviewKeyboard for the actual bindings.
 */
export function AdminReview() {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('draft');
  const [cards, setCards] = useState<AdminCardDto[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  const [counts, setCounts] = useState<StatusCounts>(ZERO_COUNTS);

  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [edits, setEdits] = useState<ReviewCardRequest>({});
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [actionError, setActionError] = useState<string | null>(null);
  const [genMetaOpen, setGenMetaOpen] = useState(false);
  const [cheatSheetOpen, setCheatSheetOpen] = useState(() => !hasSeenCheatSheet());

  const tileRefs = useRef(new Map<string, HTMLDivElement>());
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const registerTileRef = useCallback((id: string, element: HTMLDivElement | null) => {
    if (element) tileRefs.current.set(id, element);
    else tileRefs.current.delete(id);
  }, []);
  const focusCard = useCallback((id: string) => {
    setFocusedId(id);
  }, []);

  // --- Loading the grid ----------------------------------------------------

  useEffect(() => {
    let cancelled = false;
    setListLoading(true);
    setListError(null);
    getAdminCards({
      status: statusFilter === 'all' ? undefined : statusFilter,
      page: 1,
      limit: PAGE_SIZE,
    })
      .then((res) => {
        if (cancelled) return;
        setCards(res.items);
        setTotal(res.total);
        setPage(1);
      })
      .catch((err: unknown) => {
        if (!cancelled) setListError(errorMessage(err));
      })
      .finally(() => {
        if (!cancelled) setListLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [statusFilter]);

  const loadMore = useCallback(async () => {
    if (listLoading || cards.length >= total) return;
    const nextPage = page + 1;
    setListLoading(true);
    try {
      const res = await getAdminCards({
        status: statusFilter === 'all' ? undefined : statusFilter,
        page: nextPage,
        limit: PAGE_SIZE,
      });
      setCards((prev) => [...prev, ...res.items]);
      setTotal(res.total);
      setPage(nextPage);
    } catch (err) {
      setListError(errorMessage(err));
    } finally {
      setListLoading(false);
    }
  }, [listLoading, cards.length, total, page, statusFilter]);

  // Infinite scroll for the "hundreds of cards" case. IntersectionObserver
  // doesn't exist under jsdom, so this degrades to the manual "Load more"
  // button rendered below rather than throwing in tests.
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return undefined;
    const sentinel = sentinelRef.current;
    if (!sentinel) return undefined;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) void loadMore();
    });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [loadMore]);

  // --- Status counts for the progress readout ------------------------------

  const refreshCounts = useCallback(async () => {
    try {
      const [draft, approved, rejected, all] = await Promise.all([
        getAdminCards({ status: 'draft', limit: 1 }),
        getAdminCards({ status: 'approved', limit: 1 }),
        getAdminCards({ status: 'rejected', limit: 1 }),
        getAdminCards({ limit: 1 }),
      ]);
      setCounts({
        draft: draft.total,
        approved: approved.total,
        rejected: rejected.total,
        all: all.total,
      });
    } catch {
      // Non-fatal — the progress readout just goes stale until the next
      // successful review action refreshes it.
    }
  }, []);

  useEffect(() => {
    void refreshCounts();
  }, [refreshCounts]);

  // --- Focus management -----------------------------------------------------

  // Exactly one card is focused at all times; when the list changes (filter
  // switch, page load) and the previous focus target is gone, fall back to
  // the first card rather than leaving focus dangling on nothing.
  useEffect(() => {
    if (cards.length === 0) {
      if (focusedId !== null) setFocusedId(null);
      return;
    }
    if (!cards.some((c) => c.id === focusedId)) {
      setFocusedId(cards[0]!.id);
    }
  }, [cards, focusedId]);

  useEffect(() => {
    const card = cards.find((c) => c.id === focusedId);
    if (card) {
      setEdits(editsFromCard(card));
      setGenMetaOpen(false);
    }
    const el = focusedId ? tileRefs.current.get(focusedId) : undefined;
    // This is what lets an operator walk hundreds of cards by keyboard alone
    // and always be able to see where they are. Guarded with `?.` on the
    // method itself too — jsdom (unlike every real browser) doesn't
    // implement scrollIntoView at all.
    el?.scrollIntoView?.({ block: 'nearest' });
    // Deliberately keyed on focusedId only: `cards` is read for its value at
    // the moment focus changes, not to re-run this (and wipe in-progress
    // edits) every time an unrelated optimistic update touches the list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusedId]);

  const focusedIndex = useMemo(
    () => cards.findIndex((c) => c.id === focusedId),
    [cards, focusedId],
  );

  const focusByIndex = useCallback(
    (index: number) => {
      const clamped = Math.max(0, Math.min(index, cards.length - 1));
      const next = cards[clamped];
      if (next) setFocusedId(next.id);
      // Prefetch before the operator actually reaches the edge — waiting for
      // the sentinel to scroll into view would stall navigation right when
      // momentum matters most.
      if (clamped >= cards.length - 3 && cards.length < total) void loadMore();
    },
    [cards, total, loadMore],
  );

  const goNext = useCallback(() => focusByIndex(focusedIndex + 1), [focusByIndex, focusedIndex]);
  const goPrev = useCallback(() => focusByIndex(focusedIndex - 1), [focusByIndex, focusedIndex]);

  // --- Editing ---------------------------------------------------------------

  const updateEdit = useCallback(
    <K extends keyof ReviewCardRequest>(field: K, value: ReviewCardRequest[K]) => {
      setEdits((prev) => ({ ...prev, [field]: value }));
    },
    [],
  );

  // --- Review actions ---------------------------------------------------------

  const reviewFocused = useCallback(
    async (status: CardStatus) => {
      const original = cards.find((c) => c.id === focusedId);
      if (!original) return;
      const body: ReviewCardRequest = { ...edits, status };

      // Optimistic: review is ~50 minutes of clicking, measured as longer
      // than generating the cards in the first place. Waiting on a network
      // round trip per card is what turns that into three hours.
      setCards((prev) => prev.map((c) => (c.id === original.id ? { ...c, ...edits, status } : c)));
      setPendingIds((prev) => new Set(prev).add(original.id));
      setActionError(null);

      // Advance immediately — "press A A A R A and never touch the mouse"
      // only works if the next card is already focused before the server
      // has replied to this one.
      goNext();

      try {
        const orderId = status === 'approved' ? generationOrderId(original) : null;
        if (orderId) {
          await selectGenerationOrderCandidate(orderId, {
            candidateId: (original.genMeta.generationOrder as Record<string, unknown>).candidateId as string,
            name: body.name ?? original.name,
            rarity: body.rarity,
            attack: body.attack,
            defense: body.defense,
            flavorText: body.flavorText,
          });
          // Choosing one candidate atomically rejects its siblings server-side.
          setCards((prev) => prev.filter((card) => generationOrderId(card) !== orderId));
        } else {
          const updated = await reviewCard(original.id, body);
          setCards((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
        }
        void refreshCounts();
      } catch (err) {
        // Roll back exactly this card, not the whole list — other
        // optimistic edits may have landed in the meantime.
        setCards((prev) => prev.map((c) => (c.id === original.id ? original : c)));
        setActionError(errorMessage(err));
      } finally {
        setPendingIds((prev) => {
          const next = new Set(prev);
          next.delete(original.id);
          return next;
        });
      }
    },
    [cards, edits, focusedId, goNext, refreshCounts],
  );

  const approveFocused = useCallback(() => {
    void reviewFocused('approved');
  }, [reviewFocused]);
  const rejectFocused = useCallback(() => {
    void reviewFocused('rejected');
  }, [reviewFocused]);

  // --- Keyboard ---------------------------------------------------------------

  const editNameField = useCallback(() => {
    const el = document.getElementById('card-review-name-input');
    if (el instanceof HTMLInputElement) {
      el.focus();
      el.select();
    }
  }, []);

  const setRarityByIndex = useCallback(
    (index: number) => {
      const rarity = RARITIES[index];
      if (rarity) updateEdit('rarity', rarity);
    },
    [updateEdit],
  );

  const blurOrClose = useCallback(() => {
    if (genMetaOpen) {
      setGenMetaOpen(false);
      return;
    }
    const active = document.activeElement;
    if (active instanceof HTMLElement) active.blur();
  }, [genMetaOpen]);

  const toggleCheatSheet = useCallback(() => {
    setCheatSheetOpen((open) => {
      const next = !open;
      if (!next) markCheatSheetSeen();
      return next;
    });
  }, []);

  const keyboardHandlers: ReviewKeyboardHandlers = useMemo(
    () => ({
      next: goNext,
      prev: goPrev,
      approve: approveFocused,
      reject: rejectFocused,
      editName: editNameField,
      setRarityByIndex,
      blurOrClose,
      toggleCheatSheet,
    }),
    [goNext, goPrev, approveFocused, rejectFocused, editNameField, setRarityByIndex, blurOrClose, toggleCheatSheet],
  );

  const shortcuts = useReviewKeyboard(keyboardHandlers);

  // --- Render -------------------------------------------------------------

  const focusedCard = cards.find((c) => c.id === focusedId) ?? null;
  const reviewedCount = counts.approved + counts.rejected;

  return (
    <div className="flex min-h-screen flex-col bg-neutral-950 text-neutral-100 lg:h-[calc(100vh-3rem)] lg:min-h-0">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-800 px-4 py-3 sm:gap-4 sm:px-6 sm:py-4">
        <div>
          <h1 className="text-xl font-bold">Card Review</h1>
          <p data-testid="review-progress" className="text-sm text-neutral-400">
            {reviewedCount} / {counts.all} reviewed
            <span className="ml-3 text-neutral-500">
              draft {counts.draft} &middot; approved {counts.approved} &middot; rejected{' '}
              {counts.rejected}
            </span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setStatusFilter(f)}
              className={`rounded-md border px-3 py-1.5 text-sm capitalize transition-colors ${
                f === statusFilter
                  ? 'border-amber-400 bg-amber-400/10 text-amber-300'
                  : 'border-neutral-700 text-neutral-300 hover:border-neutral-500'
              }`}
            >
              {f}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setCheatSheetOpen(true)}
            className="rounded-md border border-neutral-700 px-3 py-1.5 text-sm text-neutral-300 hover:border-neutral-500"
          >
            Shortcuts (?)
          </button>
        </div>
      </header>

      {actionError && <ErrorBanner className="mx-4 sm:mx-6">{actionError}</ErrorBanner>}
      {listError && <ErrorBanner className="mx-4 sm:mx-6">{listError}</ErrorBanner>}

      <div className="flex flex-col gap-4 overflow-visible p-3 lg:min-h-0 lg:flex-1 lg:flex-row lg:overflow-hidden lg:p-4">
        <div className="grid w-full auto-rows-max grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-3 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:pr-2">
          {cards.map((card) => (
            <AdminReviewTile
              key={card.id}
              card={card}
              focused={card.id === focusedId}
              pending={pendingIds.has(card.id)}
              onFocus={focusCard}
              onRefChange={registerTileRef}
            />
          ))}

          <div ref={sentinelRef} className="col-span-full h-1" />

          {cards.length < total && (
            <button
              type="button"
              onClick={() => void loadMore()}
              disabled={listLoading}
              className="col-span-full rounded-md border border-neutral-700 py-2 text-sm text-neutral-400 hover:border-neutral-500 disabled:opacity-50"
            >
              {listLoading ? 'Loading…' : 'Load more'}
            </button>
          )}

          {!listLoading && cards.length === 0 && (
            <p className="col-span-full py-8 text-center text-sm text-neutral-500">
              No cards in this view.
            </p>
          )}
        </div>

        <div className="w-full lg:w-96 lg:shrink-0">
          <CardReviewPanel
            card={focusedCard}
            edits={edits}
            onEditField={updateEdit}
            onApprove={approveFocused}
            onReject={rejectFocused}
            pending={focusedCard ? pendingIds.has(focusedCard.id) : false}
            genMetaOpen={genMetaOpen}
            onGenMetaOpenChange={setGenMetaOpen}
          />
        </div>
      </div>

      {cheatSheetOpen && (
        <Modal
          label="Keyboard shortcuts"
          hideCloseButton
          onClose={() => {
            setCheatSheetOpen(false);
            markCheatSheetSeen();
          }}
        >
            <h2 className="text-lg font-bold text-neutral-100">Keyboard shortcuts</h2>
            <ul className="mt-4 flex flex-col gap-2">
              {shortcuts.map((s) => (
                <li key={s.label} className="flex items-center justify-between gap-4 text-sm">
                  <span className="text-neutral-300">{s.label}</span>
                  <span className="flex gap-1">
                    {s.keys.map((k) => (
                      <kbd
                        key={k}
                        className="rounded border border-neutral-600 bg-neutral-800 px-1.5 py-0.5 font-mono text-xs text-neutral-200"
                      >
                        {k}
                      </kbd>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
            <Button
              size="sm"
              onClick={() => {
                setCheatSheetOpen(false);
                markCheatSheetSeen();
              }}
              className="mt-6 w-full"
            >
              Got it
            </Button>
        </Modal>
      )}
    </div>
  );
}
