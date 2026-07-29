import type { ReactNode } from 'react';

export interface ErrorBannerProps {
  children: ReactNode;
  /** Renders a trailing text button — used by the lobby's "Retry". */
  action?: { label: string; onClick: () => void };
  className?: string;
}

/**
 * The inline failure strip. Seven screens each spelled out
 * `border-red-500/50 bg-red-500/10 …` with slightly different padding and
 * rounding; a failed fetch should look identical wherever it happens.
 */
export function ErrorBanner({ children, action, className }: ErrorBannerProps) {
  return (
    <div
      role="alert"
      className={`flex items-center justify-between gap-4 rounded-md border border-red-500/50 bg-red-500/10 px-4 py-2 text-sm text-red-300 ${className ?? ''}`}
    >
      <span>{children}</span>
      {action && (
        <button type="button" onClick={action.onClick} className="shrink-0 font-semibold underline">
          {action.label}
        </button>
      )}
    </div>
  );
}
