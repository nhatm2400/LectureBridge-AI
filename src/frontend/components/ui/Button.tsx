import * as React from 'react';

import { cn } from '@/lib/utils';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md';

export function buttonClassName({
  variant = 'primary',
  size = 'md',
  className,
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
} = {}) {
  return cn(
    'inline-flex min-h-11 items-center justify-center gap-2 rounded-md border text-sm font-bold transition-colors duration-150',
    'focus-visible:outline-none disabled:pointer-events-none disabled:opacity-55',
    size === 'sm' ? 'px-3 py-2' : 'px-4 py-2.5',
    variant === 'primary' && 'border-transparent bg-[var(--lb-accent)] text-[var(--lb-on-accent)] hover:bg-[var(--lb-accent-hover)]',
    variant === 'secondary' && 'border-[var(--lb-border-strong)] bg-[var(--lb-elevated)] text-[var(--lb-ink)] hover:bg-[var(--lb-accent-soft)]',
    variant === 'ghost' && 'border-transparent bg-transparent text-[var(--lb-muted)] hover:bg-[var(--lb-accent-soft)] hover:text-[var(--lb-ink)]',
    variant === 'danger' && 'border-transparent bg-[var(--lb-danger)] text-white hover:opacity-90',
    className,
  );
}

export const Button = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
}>(({ className, variant, size, type = 'button', ...props }, ref) => (
  <button ref={ref} type={type} className={buttonClassName({ variant, size, className })} {...props} />
));

Button.displayName = 'Button';
