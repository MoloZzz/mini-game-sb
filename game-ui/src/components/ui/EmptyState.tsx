import type { ReactNode } from 'react';

import { Panel } from './Panel';

export interface EmptyStateProps {
  children: ReactNode;
  className?: string;
}

/** The dashed "nothing here yet" placeholder, shared by the inventory grid,
 * the collection grid and the detail slot. */
export function EmptyState({ children, className }: EmptyStateProps) {
  return (
    <Panel
      muted
      padding="none"
      className={`flex flex-col items-center justify-center gap-2 px-4 py-16 text-center text-sm text-neutral-300 ${className ?? ''}`}
    >
      {children}
    </Panel>
  );
}
