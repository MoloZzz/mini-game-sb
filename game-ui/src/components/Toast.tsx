import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';

export type ToastTone = 'error' | 'info' | 'success';

export interface Toast {
  id: number;
  message: string;
  tone: ToastTone;
}

interface ToastApi {
  push: (message: string, tone?: ToastTone) => void;
  dismiss: (id: number) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const AUTO_DISMISS_MS = 5000;

const TONE_CLASSES: Readonly<Record<ToastTone, string>> = {
  error: 'border-red-500/50 bg-red-500/10 text-red-300',
  info: 'border-neutral-700 bg-neutral-900 text-neutral-200',
  success: 'border-emerald-500/50 bg-emerald-500/10 text-emerald-300',
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (message: string, tone: ToastTone = 'error') => {
      const id = nextId.current++;
      setToasts((current) => [...current, { id, message, tone }]);
      // Timers are fire-and-forget: `dismiss` is a no-op once the toast is
      // already gone, so an unmount mid-flight cannot throw.
      setTimeout(() => dismiss(id), AUTO_DISMISS_MS);
    },
    [dismiss],
  );

  const api = useMemo<ToastApi>(() => ({ push, dismiss }), [push, dismiss]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role="alert"
            className={`pointer-events-auto flex w-full max-w-md items-center justify-between gap-4 rounded-md border px-4 py-2 text-sm shadow-lg ${TONE_CLASSES[toast.tone]}`}
          >
            <span>{toast.message}</span>
            <button
              type="button"
              onClick={() => dismiss(toast.id)}
              aria-label="Dismiss"
              className="shrink-0 opacity-60 transition-opacity hover:opacity-100"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/**
 * Falls back to a no-op outside a provider so a component under test can be
 * rendered in isolation without every suite having to wrap it.
 */
export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  return api ?? NOOP_TOAST_API;
}

const NOOP_TOAST_API: ToastApi = { push: () => {}, dismiss: () => {} };
