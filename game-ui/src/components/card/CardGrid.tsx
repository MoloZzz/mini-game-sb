import type { ReactNode } from 'react';

export interface CardGridProps {
  children: ReactNode;
  className?: string;
}

/**
 * The one card-grid geometry. `grid-cols-2 sm:3 md:4 lg:5` was written out in
 * four places — the inventory grid, the collection gallery and both loading
 * skeletons — so the skeleton and the real grid could drift apart silently.
 */
export function CardGrid({ children, className }: CardGridProps) {
  return (
    <div className={`grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 ${className ?? ''}`}>
      {children}
    </div>
  );
}
