'use client';

import { ArrowLeft, Check, Link2, RotateCcw } from 'lucide-react';
import Link from 'next/link';

import { Brand } from '@/components/Brand';
import { ThemeToggle } from '@/components/ThemeToggle';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen bg-[var(--lb-canvas)] lg:grid-cols-[minmax(360px,.82fr)_1.18fr]">
      <aside className="hidden border-r border-[var(--lb-border)] bg-[var(--lb-surface)] p-10 lg:flex lg:flex-col xl:p-14">
        <Brand />
        <div className="my-auto max-w-lg py-12">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--lb-accent)]">Learning continuity</p>
          <h1 className="mt-5 font-editorial text-5xl font-semibold leading-[1.05] tracking-[-0.045em]">Quay lại mạch bài giảng, với bằng chứng ở ngay bên cạnh.</h1>
          <div className="mt-10 space-y-5 border-l border-[var(--lb-border)] pl-6">
            <p className="flex gap-3 text-sm leading-6 text-[var(--lb-muted)]"><RotateCcw size={18} className="mt-0.5 shrink-0 text-[var(--lb-accent)]" /> Phục hồi đúng cửa sổ nội dung vừa bỏ lỡ.</p>
            <p className="flex gap-3 text-sm leading-6 text-[var(--lb-muted)]"><Link2 size={18} className="mt-0.5 shrink-0 text-[var(--lb-accent)]" /> Nhảy về timestamp nguồn để tự kiểm chứng.</p>
            <p className="flex gap-3 text-sm leading-6 text-[var(--lb-muted)]"><Check size={18} className="mt-0.5 shrink-0 text-[var(--lb-accent)]" /> Không suy đoán khi bài giảng không có bằng chứng.</p>
          </div>
        </div>
        <p className="text-xs leading-5 text-[var(--lb-subtle)]">Captions show the words. LectureBridge restores the learning thread.</p>
      </aside>

      <main id="main-content" tabIndex={-1} className="relative flex min-h-screen items-center justify-center px-5 py-24 sm:px-8 lg:px-14">
        <div className="absolute left-4 top-3 lg:hidden"><Brand /></div>
        <div className="absolute right-4 top-3 flex items-center gap-1">
          <ThemeToggle />
          <Link href="/" className="inline-flex min-h-11 items-center gap-2 rounded-md px-3 text-sm font-semibold text-[var(--lb-muted)] hover:bg-[var(--lb-accent-soft)] hover:text-[var(--lb-ink)]">
            <ArrowLeft size={17} aria-hidden="true" /> <span className="hidden sm:inline">Trang chủ</span>
          </Link>
        </div>
        <div className="w-full max-w-[440px] rounded-[10px] border border-[var(--lb-border)] bg-[var(--lb-surface)] p-6 sm:p-8 lg:border-0 lg:bg-transparent lg:p-0">{children}</div>
      </main>
    </div>
  );
}
