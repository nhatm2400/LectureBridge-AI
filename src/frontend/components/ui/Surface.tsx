import * as React from 'react';

import { cn } from '@/lib/utils';

export function Surface({
  as: Component = 'section',
  className,
  ...props
}: React.HTMLAttributes<HTMLElement> & { as?: 'section' | 'article' | 'div' | 'aside' }) {
  return (
    <Component
      className={cn('rounded-[10px] border border-[var(--lb-border)] bg-[var(--lb-surface)]', className)}
      {...props}
    />
  );
}
