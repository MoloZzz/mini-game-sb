import { useEffect, useRef } from 'react';
import { RARITIES } from '@card-game/shared-types';

export interface ReviewKeyboardHandlers {
  next: () => void;
  prev: () => void;
  approve: () => void;
  reject: () => void;
  editName: () => void;
  setRarityByIndex: (index: number) => void;
  blurOrClose: () => void;
  toggleCheatSheet: () => void;
}

export interface ShortcutBinding {
  keys: readonly string[];
  label: string;
}

/**
 * The single source of truth for the shortcut map. The cheat-sheet overlay
 * renders straight from the array `useReviewKeyboard` returns instead of a
 * hand-copied duplicate list that would silently drift the moment a key is
 * added or reassigned here.
 */
export const REVIEW_SHORTCUTS: readonly ShortcutBinding[] = [
  { keys: ['→', 'J'], label: 'Next card' },
  { keys: ['←', 'K'], label: 'Previous card' },
  { keys: ['A'], label: 'Approve, then advance' },
  { keys: ['R'], label: 'Reject, then advance' },
  { keys: ['E'], label: 'Edit name' },
  { keys: ['1', '2', '3', '4', '5', '6'], label: 'Set rarity' },
  { keys: ['Esc'], label: 'Blur field / close generation details' },
  { keys: ['?'], label: 'Toggle this cheat sheet' },
];

const RARITY_KEYS = ['1', '2', '3', '4', '5', '6'];

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

/**
 * Binds the review shortcuts at the window level for as long as the caller
 * keeps this hook mounted — the effect's cleanup is what makes the bindings
 * "only active while the review screen is mounted" rather than something a
 * caller has to remember to tear down by hand.
 *
 * Review is ~50 minutes of clicking, measured as longer than generating the
 * cards in the first place (ADR-013) — the entire point of this hook is
 * letting an operator keep one hand on the keyboard the whole time. That
 * only works if typing into a field never gets misread as a shortcut, so
 * every key except Escape is gated behind `isEditableTarget`.
 */
export function useReviewKeyboard(
  handlers: ReviewKeyboardHandlers,
  enabled = true,
): readonly ShortcutBinding[] {
  // Handlers are read through a ref so the listener is bound once per mount
  // rather than being torn down and rebound on every render — approving or
  // rejecting a card changes several pieces of state upstream each time.
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    if (!enabled) return undefined;

    function onKeyDown(event: KeyboardEvent): void {
      const h = handlersRef.current;

      // Escape is the universal "get me out" gesture — it must work even
      // while a field has focus, so it is checked before the editable guard.
      if (event.key === 'Escape') {
        h.blurOrClose();
        return;
      }

      // Every other shortcut is a single bare letter, digit or arrow. If
      // focus is inside an input, textarea, select or contenteditable,
      // typing a card name or flavour text must never be interpreted as
      // "approve" or "reject" — that bug is what makes a screen like this
      // unusable in practice.
      if (isEditableTarget(event.target)) return;

      switch (event.key) {
        case 'ArrowRight':
        case 'j':
        case 'J':
          h.next();
          return;
        case 'ArrowLeft':
        case 'k':
        case 'K':
          h.prev();
          return;
        case 'a':
        case 'A':
          h.approve();
          return;
        case 'r':
        case 'R':
          h.reject();
          return;
        case 'e':
        case 'E':
          h.editName();
          return;
        case '?':
          h.toggleCheatSheet();
          return;
        default:
          break;
      }

      const rarityIndex = RARITY_KEYS.indexOf(event.key);
      if (rarityIndex >= 0 && rarityIndex < RARITIES.length) {
        h.setRarityByIndex(rarityIndex);
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [enabled]);

  return REVIEW_SHORTCUTS;
}
