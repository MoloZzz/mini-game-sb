import type { HTMLAttributes } from 'react';

export type PanelPadding = 'none' | 'sm' | 'md' | 'lg';

export interface PanelProps extends HTMLAttributes<HTMLDivElement> {
  padding?: PanelPadding;
  /** Renders a dashed, de-emphasised border — for placeholders and empty slots. */
  muted?: boolean;
}

const PADDING_CLASSES: Readonly<Record<PanelPadding, string>> = {
  none: '',
  sm: 'px-4 py-3',
  md: 'p-4',
  lg: 'p-5',
};

/**
 * The app's one surface: `rounded-lg border border-neutral-800 bg-neutral-900`.
 * That exact string was repeated in eleven files with four different padding
 * choices — every panel now picks a named padding instead of retyping it.
 */
export function Panel({ padding = 'md', muted = false, className, ...rest }: PanelProps) {
  const border = muted ? 'border border-dashed border-neutral-700' : 'border border-neutral-800';
  const background = muted ? '' : 'bg-neutral-900';

  return (
    <div
      className={`rounded-lg ${border} ${background} ${PADDING_CLASSES[padding]} ${className ?? ''}`}
      {...rest}
    />
  );
}
