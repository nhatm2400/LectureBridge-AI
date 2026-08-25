'use client';

import { Languages } from 'lucide-react';

import { useI18n } from '@/lib/i18n';

export function LanguageToggle() {
  const { locale, setLocale, t } = useI18n();
  const nextLocale = locale === 'vi' ? 'en' : 'vi';
  const nextLabel = locale === 'vi' ? 'English' : 'Tiếng Việt';

  return (
    <button
      type="button"
      aria-label={t('Chuyển giao diện sang tiếng Anh', 'Switch interface to Vietnamese')}
      title={t('Chuyển sang tiếng Anh', 'Switch to Vietnamese')}
      onClick={() => setLocale(nextLocale)}
      className="inline-flex h-11 min-w-14 shrink-0 items-center justify-center gap-1.5 rounded-md border border-transparent px-2 text-xs font-bold text-[var(--lb-muted)] transition-colors duration-150 hover:bg-[var(--lb-accent-soft)] hover:text-[var(--lb-ink)] focus-visible:outline-none"
      suppressHydrationWarning
    >
      <Languages size={17} aria-hidden="true" />
      <span aria-hidden="true">{nextLocale.toUpperCase()}</span>
      <span className="sr-only">{nextLabel}</span>
    </button>
  );
}
