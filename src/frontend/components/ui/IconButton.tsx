import * as React from 'react';

import { cn } from '@/lib/utils';

export const IconButton = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
}>(({ className, label, type = 'button', ...props }, ref) => (
  <button
    ref={ref}
    type={type}
    aria-label={label}
    title={label}
    className={cn(
      'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-transparent text-[var(--lb-muted)] transition-colors duration-150',
      'hover:bg-[var(--lb-accent-soft)] hover:text-[var(--lb-ink)] focus-visible:outline-none disabled:pointer-events-none disabled:opacity-55',
      className,
    )}
    {...props}
  />
));

IconButton.displayName = 'IconButton';
