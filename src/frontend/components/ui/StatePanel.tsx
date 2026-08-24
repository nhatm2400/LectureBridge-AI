import { AlertCircle, Inbox, LoaderCircle } from 'lucide-react';
import { ReactNode } from 'react';

import { cn } from '@/lib/utils';
import { Surface } from './Surface';

export function StatePanel({
  state,
  title,
  description,
  action,
  className,
}: {
  state: 'loading' | 'empty' | 'error';
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  const Icon = state === 'loading' ? LoaderCircle : state === 'error' ? AlertCircle : Inbox;
  return (
    <Surface
      className={cn('flex min-h-48 flex-col items-center justify-center px-6 py-10 text-center', className)}
      role={state === 'error' ? 'alert' : 'status'}
      aria-live="polite"
    >
      <span className="mb-4 flex h-11 w-11 items-center justify-center rounded-md bg-[var(--lb-accent-soft)] text-[var(--lb-accent)]">
        <Icon className={state === 'loading' ? 'animate-spin' : ''} size={21} aria-hidden="true" />
      </span>
      <h2 className="text-lg">{title}</h2>
      {description && <p className="mt-2 max-w-md text-sm leading-6 text-[var(--lb-muted)]">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </Surface>
  );
}
