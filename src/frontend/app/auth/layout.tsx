'use client';

import { ArrowLeft, Check, Link2, RotateCcw } from 'lucide-react';
import Link from 'next/link';

import { Brand } from '@/components/Brand';
import { LanguageToggle } from '@/components/LanguageToggle';
import { ThemeToggle } from '@/components/ThemeToggle';
import { useI18n } from '@/lib/i18n';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  const { t } = useI18n();

  return (
    <div className="grid min-h-screen bg-[var(--lb-canvas)] lg:grid-cols-[minmax(360px,.82fr)_1.18fr]">
      <aside className="hidden border-r border-[var(--lb-border)] bg-[var(--lb-surface)] p-10 lg:flex lg:flex-col xl:p-14">
        <Brand />
        <div className="my-auto max-w-lg py-12">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--lb-accent)]">{t('Mạch học liên tục', 'Learning continuity')}</p>
          <h1 className="mt-5 font-editorial text-5xl font-semibold leading-[1.05] tracking-[-0.045em]">{t('Quay lại mạch bài giảng, với bằng chứng ở ngay bên cạnh.', 'Return to the learning thread, with evidence beside every step.')}</h1>
          <div className="mt-10 space-y-5 border-l border-[var(--lb-border)] pl-6">
            <p className="flex gap-3 text-sm leading-6 text-[var(--lb-muted)]"><RotateCcw size={18} className="mt-0.5 shrink-0 text-[var(--lb-accent)]" /> {t('Phục hồi đúng cửa sổ nội dung vừa bỏ lỡ.', 'Recover the exact content window you missed.')}</p>
            <p className="flex gap-3 text-sm leading-6 text-[var(--lb-muted)]"><Link2 size={18} className="mt-0.5 shrink-0 text-[var(--lb-accent)]" /> {t('Nhảy về timestamp nguồn để tự kiểm chứng.', 'Jump to the source timestamp and verify it yourself.')}</p>
            <p className="flex gap-3 text-sm leading-6 text-[var(--lb-muted)]"><Check size={18} className="mt-0.5 shrink-0 text-[var(--lb-accent)]" /> {t('Không suy đoán khi bài giảng không có bằng chứng.', 'No guessing when the lecture provides no evidence.')}</p>
          </div>
        </div>
        <p className="text-xs leading-5 text-[var(--lb-subtle)]">{t('Phụ đề cho biết lời đã nói. LectureBridge khôi phục mạch học.', 'Captions show the words. LectureBridge restores the learning thread.')}</p>
      </aside>

      <main id="main-content" tabIndex={-1} className="relative flex min-h-screen items-center justify-center px-5 py-24 sm:px-8 lg:px-14">
        <div className="absolute left-4 top-3 lg:hidden"><Brand /></div>
        <div className="absolute right-4 top-3 flex items-center gap-1">
          <LanguageToggle />
          <ThemeToggle />
          <Link href="/" className="inline-flex min-h-11 items-center gap-2 rounded-md px-3 text-sm font-semibold text-[var(--lb-muted)] hover:bg-[var(--lb-accent-soft)] hover:text-[var(--lb-ink)]">
            <ArrowLeft size={17} aria-hidden="true" /> <span className="hidden sm:inline">{t('Trang chủ', 'Home')}</span>
          </Link>
        </div>
        <div className="w-full max-w-[440px] rounded-[10px] border border-[var(--lb-border)] bg-[var(--lb-surface)] p-6 sm:p-8 lg:border-0 lg:bg-transparent lg:p-0">{children}</div>
      </main>
    </div>
  );
}
