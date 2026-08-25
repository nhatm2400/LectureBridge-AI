'use client';

import { useI18n } from '@/lib/i18n';

export function Footer() {
  const { t } = useI18n();
  return (
    <footer className="shrink-0 border-t border-[var(--lb-border)] bg-[var(--lb-surface)]">
      <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-1 px-5 py-5 text-sm text-[var(--lb-muted)] sm:flex-row sm:items-center sm:justify-between sm:px-8 lg:px-10">
        <span>© 2026 LectureBridge</span>
        <span>{t('Khôi phục mạch học có căn cứ', 'Evidence-grounded learning continuity')}</span>
      </div>
    </footer>
  );
}
