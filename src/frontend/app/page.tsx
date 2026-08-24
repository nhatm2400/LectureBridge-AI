'use client';

import {
  ArrowRight,
  BookOpen,
  Check,
  CornerDownRight,
  Link2,
  MessageSquareText,
  RotateCcw,
} from 'lucide-react';
import Link from 'next/link';

import { Brand } from '@/components/Brand';
import { ThemeToggle } from '@/components/ThemeToggle';
import { buttonClassName } from '@/components/ui/Button';

const recoverySteps = [
  {
    number: '01',
    title: 'Nhận ra điều đã thay đổi',
    description: 'Timeline ngữ nghĩa chỉ ra chủ đề mới, câu hỏi và ví dụ quan trọng thay vì bắt bạn đọc lại transcript phẳng.',
    icon: BookOpen,
  },
  {
    number: '02',
    title: 'Khôi phục đúng đoạn bị lỡ',
    description: 'Context Recovery dựng lại cửa sổ bài giảng ngay trước vị trí hiện tại và nối câu hỏi với câu trả lời xuất hiện sau đó.',
    icon: RotateCcw,
  },
  {
    number: '03',
    title: 'Kiểm chứng tại nguồn',
    description: 'Mỗi bằng chứng dẫn về timestamp đã được backend xác thực để người học nghe lại chính đoạn cần thiết.',
    icon: Link2,
  },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[var(--lb-canvas)] text-[var(--lb-ink)]">
      <header className="sticky top-0 z-40 h-16 border-b border-[var(--lb-border)] bg-[var(--lb-surface)]">
        <div className="mx-auto flex h-full max-w-[1440px] items-center justify-between px-5 sm:px-8 lg:px-12">
          <Brand wordmarkClassName="hidden min-[420px]:inline" />
          <div className="flex items-center gap-1 sm:gap-3">
            <a href="#how-it-works" className="hidden min-h-11 items-center rounded-md px-3 text-sm font-semibold text-[var(--lb-muted)] hover:bg-[var(--lb-accent-soft)] hover:text-[var(--lb-ink)] sm:inline-flex">Cách hoạt động</a>
            <ThemeToggle />
            <Link href="/auth/login" className={buttonClassName({ size: 'sm' })}>Đăng nhập</Link>
          </div>
        </div>
      </header>

      <main id="main-content" tabIndex={-1}>
        <section className="mx-auto grid min-w-0 max-w-[1440px] grid-cols-[minmax(0,1fr)] gap-12 px-5 py-16 sm:px-8 sm:py-20 lg:grid-cols-[minmax(0,1.05fr)_minmax(360px,.95fr)] lg:items-center lg:px-12 lg:py-28">
          <div className="min-w-0 max-w-3xl">
            <p className="mb-6 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-[var(--lb-accent)]">
              <span className="h-px w-8 bg-[var(--lb-accent)]" aria-hidden="true" />
              Evidence-grounded learning continuity
            </p>
            <h1 className="break-words font-editorial text-[2.65rem] font-semibold leading-[1] tracking-[-0.05em] text-[var(--lb-ink)] sm:text-[clamp(3.4rem,6vw,5.5rem)]">
              Captions show the words.
              <span className="mt-2 block text-[var(--lb-accent)]">LectureBridge restores the learning thread.</span>
            </h1>
            <p className="mt-8 max-w-2xl text-lg leading-8 text-[var(--lb-muted)]">
              Khi bạn bỏ lỡ một đoạn bài giảng, LectureBridge cho biết điều gì đã đổi, câu hỏi nào được trả lời và bằng chứng nằm ở đâu—để bạn tiếp tục học mà không phải đoán.
            </p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Link href="/auth/login" className={buttonClassName({ className: 'px-5' })}>
                Vào không gian học <ArrowRight size={18} aria-hidden="true" />
              </Link>
              <a href="#how-it-works" className={buttonClassName({ variant: 'secondary', className: 'px-5' })}>Xem hành trình khôi phục</a>
            </div>
          </div>

          <div className="min-w-0 rounded-[14px] border border-[var(--lb-border-strong)] bg-[var(--lb-surface)] p-4 sm:p-6" aria-label="Minh họa khôi phục ngữ cảnh bài giảng">
            <div className="flex items-start justify-between gap-4 border-b border-[var(--lb-border)] pb-5">
              <div>
                <p className="text-xs font-bold tracking-[0.08em] text-[var(--lb-muted)]">BÀI GIẢNG · 10:42</p>
                <h2 className="mt-2 text-xl">Transactions và mức cô lập</h2>
              </div>
              <span className="rounded-full border border-[var(--lb-border)] bg-[var(--lb-accent-soft)] px-3 py-1.5 text-xs font-bold text-[var(--lb-accent)]">Đang học</span>
            </div>
            <div className="py-6">
              <div className="mb-4 flex items-center gap-2 text-sm font-bold text-[var(--lb-ink)]">
                <RotateCcw size={18} className="text-[var(--lb-accent)]" aria-hidden="true" />
                Tôi đã bỏ lỡ gì?
              </div>
              <ol className="space-y-3">
                <li className="grid grid-cols-[4rem_minmax(0,1fr)] gap-3 rounded-md border border-[var(--lb-border)] bg-[var(--lb-elevated)] p-3 sm:grid-cols-[4.5rem_minmax(0,1fr)]">
                  <span className="text-sm font-bold text-[var(--lb-accent)]">09:58</span>
                  <span className="text-sm leading-6"><strong>Chủ đề đổi:</strong> từ repeatable read sang serializable.</span>
                </li>
                <li className="grid grid-cols-[4rem_minmax(0,1fr)] gap-3 rounded-md border border-[var(--lb-border)] bg-[var(--lb-elevated)] p-3 sm:grid-cols-[4.5rem_minmax(0,1fr)]">
                  <span className="text-sm font-bold text-[var(--lb-accent)]">10:16</span>
                  <span className="text-sm leading-6"><strong>Câu hỏi:</strong> vì sao mức cô lập mạnh hơn cần thêm phối hợp?</span>
                </li>
                <li className="grid grid-cols-[4rem_minmax(0,1fr)] gap-3 rounded-md border border-[var(--lb-accent)] bg-[var(--lb-accent-soft)] p-3 sm:grid-cols-[4.5rem_minmax(0,1fr)]">
                  <span className="text-sm font-bold text-[var(--lb-accent)]">10:31</span>
                  <span className="text-sm leading-6"><strong>Trả lời:</strong> hệ thống phải ngăn các lịch thực thi không tương đương tuần tự.</span>
                </li>
              </ol>
            </div>
            <div className="flex min-h-11 w-full items-center justify-between rounded-md border border-[var(--lb-border-strong)] bg-[var(--lb-elevated)] px-4 text-sm font-bold text-[var(--lb-ink)]">
              Mở nguồn tại 10:31 <CornerDownRight size={17} className="text-[var(--lb-accent)]" aria-hidden="true" />
            </div>
          </div>
        </section>

        <section id="how-it-works" className="scroll-mt-20 border-y border-[var(--lb-border)] bg-[var(--lb-surface)]">
          <div className="mx-auto max-w-[1440px] px-5 py-16 sm:px-8 lg:px-12 lg:py-24">
            <div className="max-w-2xl">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--lb-accent)]">Bỏ lỡ → khôi phục → kiểm chứng</p>
              <h2 className="mt-4 text-3xl leading-tight sm:text-5xl">Một đường trở lại mạch học, không phải một bản tóm tắt khác.</h2>
            </div>
            <div className="mt-12 grid border-t border-[var(--lb-border)] md:grid-cols-3">
              {recoverySteps.map((step) => (
                <article key={step.number} className="border-b border-[var(--lb-border)] py-8 md:border-b-0 md:border-r md:px-7 md:first:pl-0 md:last:border-r-0 md:last:pr-0">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold tracking-[0.14em] text-[var(--lb-subtle)]">{step.number}</span>
                    <step.icon size={21} className="text-[var(--lb-accent)]" aria-hidden="true" />
                  </div>
                  <h3 className="mt-8 text-xl">{step.title}</h3>
                  <p className="mt-3 text-sm leading-7 text-[var(--lb-muted)]">{step.description}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto grid max-w-[1440px] gap-8 px-5 py-16 sm:px-8 lg:grid-cols-2 lg:px-12 lg:py-24">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--lb-accent)]">Giới hạn rõ ràng</p>
            <h2 className="mt-4 text-3xl leading-tight sm:text-4xl">Có nguồn khi biết. Dừng lại khi không có bằng chứng.</h2>
          </div>
          <div className="space-y-4 border-l border-[var(--lb-border)] pl-6 sm:pl-8">
            {[
              'Source ID và timestamp được backend xác thực trước khi hiển thị.',
              'Câu trả lời ngoài nội dung bài giảng được từ chối thay vì suy đoán.',
              'Human review giữ vai trò xác nhận cuối cùng trong đánh giá.',
            ].map((item) => (
              <p key={item} className="flex gap-3 text-sm leading-7 text-[var(--lb-muted)]">
                <Check size={18} className="mt-1 shrink-0 text-[var(--lb-accent)]" aria-hidden="true" /> {item}
              </p>
            ))}
          </div>
        </section>

        <section className="border-t border-[var(--lb-border)] bg-[var(--lb-accent)] text-[var(--lb-on-accent)]">
          <div className="mx-auto flex max-w-[1440px] flex-col gap-7 px-5 py-12 sm:px-8 md:flex-row md:items-center md:justify-between lg:px-12">
            <div className="flex items-start gap-4">
              <MessageSquareText size={24} className="mt-1 shrink-0" aria-hidden="true" />
              <div>
                <h2 className="text-2xl text-[var(--lb-on-accent)]">Tiếp tục đúng nơi bạn đã mất mạch.</h2>
                <p className="mt-2 text-sm leading-6 opacity-85">Mở bài giảng, phục hồi ngữ cảnh và kiểm chứng ngay tại nguồn.</p>
              </div>
            </div>
            <Link href="/auth/login" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-[var(--lb-elevated)] px-5 text-sm font-bold text-[var(--lb-ink)] hover:opacity-90">
              Đăng nhập <ArrowRight size={18} aria-hidden="true" />
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-[var(--lb-border)] bg-[var(--lb-surface)]">
        <div className="mx-auto flex max-w-[1440px] flex-col gap-2 px-5 py-7 text-sm text-[var(--lb-muted)] sm:flex-row sm:items-center sm:justify-between sm:px-8 lg:px-12">
          <span>© 2026 LectureBridge</span>
          <span>Evidence-grounded learning continuity</span>
        </div>
      </footer>
    </div>
  );
}
