import Link from 'next/link';

import { cn } from '@/lib/utils';

export function BrandMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 40 40"
      aria-hidden="true"
      className={cn('h-9 w-9 shrink-0', className)}
      fill="none"
    >
      <rect x="1" y="1" width="38" height="38" rx="8" fill="var(--lb-accent)" />
      <path d="M9 12.5c4.4 0 8.1 1.1 11 3.5v14c-2.9-2.2-6.6-3.3-11-3.3V12.5Z" stroke="var(--lb-on-accent)" strokeWidth="2" strokeLinejoin="round" />
      <path d="M31 12.5c-4.4 0-8.1 1.1-11 3.5v14c2.9-2.2 6.6-3.3 11-3.3V12.5Z" stroke="var(--lb-on-accent)" strokeWidth="2" strokeLinejoin="round" />
      <path d="M12 22c2.8-2.4 5.4-3.6 8-3.6s5.2 1.2 8 3.6" stroke="var(--lb-on-accent)" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function Brand({
  href = '/',
  compact = false,
  className,
  wordmarkClassName,
}: {
  href?: string;
  compact?: boolean;
  className?: string;
  wordmarkClassName?: string;
}) {
  return (
    <Link href={href} className={cn('inline-flex min-h-11 shrink-0 items-center gap-2.5 rounded-md font-bold text-[var(--lb-ink)]', className)} aria-label="LectureBridge, trang chủ">
      <BrandMark />
      {!compact && <span className={cn('text-[1.05rem] tracking-[-0.02em]', wordmarkClassName)}>LectureBridge</span>}
    </Link>
  );
}
