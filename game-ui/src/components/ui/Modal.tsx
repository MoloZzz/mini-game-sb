import { useEffect, useId, useRef, type ReactNode } from 'react';

export type ModalSize = 'md' | 'lg';

export interface ModalProps {
  /** Accessible name for the dialog — required, since these dialogs have no visible <h*> title. */
  label: string;
  onClose: () => void;
  children: ReactNode;
  /** Hides the built-in × button when the content supplies its own. */
  hideCloseButton?: boolean;
  closeButtonLabel?: string;
  size?: ModalSize;
  className?: string;
  /** Applied to the inner dialog box — lets a card modal drop the default panel chrome. */
  contentClassName?: string;
}

const SIZE_CLASSES: Readonly<Record<ModalSize, string>> = {
  md: 'max-w-md',
  lg: 'max-w-2xl',
};

/**
 * Escape must close only the topmost dialog. The card detail modal opens a
 * zoom overlay on top of itself, and before this stack existed both layers
 * listened on `window` — one Escape closed both at once.
 */
const openStack: string[] = [];

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

/**
 * The app's one dialog. Owns the backdrop, backdrop-click-to-close, Escape,
 * `role="dialog"`/`aria-modal`, and a focus trap. Previously the inventory
 * detail, the collection detail and the admin viewer each hand-rolled a
 * `fixed inset-0` overlay, which is how they drifted to different widths.
 */
export function Modal({
  label,
  onClose,
  children,
  hideCloseButton = false,
  closeButtonLabel = 'Close',
  size = 'md',
  className,
  contentClassName,
}: ModalProps) {
  const id = useId();
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    openStack.push(id);
    return () => {
      const index = openStack.indexOf(id);
      if (index !== -1) openStack.splice(index, 1);
    };
  }, [id]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      // Only the topmost dialog reacts — a nested zoom layer closes first.
      if (openStack[openStack.length - 1] !== id) return;

      if (event.key === 'Escape') {
        onClose();
        return;
      }

      if (event.key !== 'Tab') return;

      const box = boxRef.current;
      if (!box) return;
      const focusable = Array.from(box.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      if (event.shiftKey && (active === first || !box.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [id, onClose]);

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    boxRef.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
    return () => previouslyFocused?.focus?.();
  }, []);

  return (
    <div
      className={`fixed inset-0 z-40 flex items-center justify-center bg-black/80 p-6 ${className ?? ''}`}
      onClick={onClose}
    >
      <div
        ref={boxRef}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        className={`relative flex max-h-full w-full flex-col overflow-y-auto ${SIZE_CLASSES[size]} ${
          contentClassName ?? 'rounded-lg border border-neutral-800 bg-neutral-900 p-5'
        }`}
        onClick={(event) => event.stopPropagation()}
      >
        {!hideCloseButton && (
          <button
            type="button"
            onClick={onClose}
            aria-label={closeButtonLabel}
            className="absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-neutral-950/80 text-lg font-bold text-neutral-100 hover:bg-neutral-800"
          >
            ×
          </button>
        )}
        {children}
      </div>
    </div>
  );
}
