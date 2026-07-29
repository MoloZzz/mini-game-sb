export interface TileSkeletonProps {
  /** Matches the grid's own responsive column count closely enough that the
   * skeleton doesn't visibly reflow once real tiles replace it. */
  count?: number;
}

const DEFAULT_COUNT = 10;

/** Placeholder squares for a `CardGrid` that is still loading. The inventory
 * and collection screens each carried their own identical copy of this. */
export function TileSkeleton({ count = DEFAULT_COUNT }: TileSkeletonProps) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="aspect-square animate-pulse rounded-lg border-2 border-neutral-800 bg-neutral-900"
        />
      ))}
    </>
  );
}
