import { forwardRef, type ButtonHTMLAttributes } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

const VARIANT_CLASSES: Readonly<Record<ButtonVariant, string>> = {
  primary: 'bg-amber-400 text-neutral-950 font-bold hover:bg-amber-300',
  secondary: 'border border-neutral-700 text-neutral-300 hover:border-neutral-500 hover:text-neutral-100',
  ghost: 'text-neutral-400 hover:text-neutral-200',
  // Reserved for the second click of a destructive confirm — never the first.
  danger: 'bg-red-500 text-neutral-950 font-bold hover:bg-red-400',
};

const SIZE_CLASSES: Readonly<Record<ButtonSize, string>> = {
  sm: 'rounded-md px-3 py-1.5 text-sm',
  md: 'rounded-lg px-5 py-2.5 text-base',
  lg: 'rounded-xl px-10 py-4 text-lg',
};

/** Nothing clever — just consistent variants/sizes shared across every screen. */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', className, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      className={`inline-flex items-center justify-center transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${VARIANT_CLASSES[variant]} ${SIZE_CLASSES[size]} ${className ?? ''}`}
      {...rest}
    />
  );
});
