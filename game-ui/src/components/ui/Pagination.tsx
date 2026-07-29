export interface PaginationProps {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  className?: string;
}

/** Prev / "Page N / M" / Next — previously copied into the inventory,
 * collection and admin screens with independent disabled-state styling. */
export function Pagination({ page, totalPages, onPageChange, className }: PaginationProps) {
  const buttonClasses =
    'rounded-md border border-neutral-700 px-3 py-1 disabled:cursor-not-allowed disabled:opacity-40';

  return (
    <div className={`flex items-center justify-center gap-3 text-sm text-neutral-400 ${className ?? ''}`}>
      <button
        type="button"
        disabled={page <= 1}
        onClick={() => onPageChange(page - 1)}
        className={buttonClasses}
      >
        Prev
      </button>
      <span>
        Page {page} / {totalPages}
      </span>
      <button
        type="button"
        disabled={page >= totalPages}
        onClick={() => onPageChange(page + 1)}
        className={buttonClasses}
      >
        Next
      </button>
    </div>
  );
}
