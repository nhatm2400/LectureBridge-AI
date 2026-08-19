'use client';

import Link from 'next/link';
import { BookOpenCheck, Captions, MessageSquareText, SearchCheck } from 'lucide-react';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen overflow-hidden bg-[#fff9fa]">
      <aside className="relative hidden w-1/2 overflow-hidden bg-slate-950 p-12 text-white lg:flex lg:items-center lg:justify-center">
        <div className="absolute -right-24 -top-24 h-96 w-96 rounded-full bg-rose-500/20 blur-3xl" />
        <div className="relative z-10 w-full max-w-lg">
          <Brand inverse />
          <div className="mt-20 rounded-[40px] border border-white/10 bg-white/5 p-9 backdrop-blur">
            <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-rose-300">Một bài giảng, nhiều cách tiếp cận</p>
            <h1 className="mt-4 text-4xl font-black leading-tight">Học từ nội dung có cấu trúc và bằng chứng nguồn rõ ràng.</h1>
            <div className="mt-9 space-y-4">
              {[
                [Captions, 'Transcript có mốc thời gian'],
                [SearchCheck, 'Timeline và điểm nhấn ngữ nghĩa'],
                [MessageSquareText, 'Hỏi đáp gắn với nguồn'],
              ].map(([Icon, label]) => {
                const ItemIcon = Icon as typeof Captions;
                return (
                  <div key={label as string} className="flex items-center gap-4 rounded-2xl bg-white/10 p-4 font-bold text-slate-100">
                    <span className="grid h-10 w-10 place-items-center rounded-xl bg-rose-400/15 text-rose-300"><ItemIcon size={20} /></span>
                    {label as string}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </aside>

      <main className="relative flex flex-1 items-center justify-center p-8 lg:p-20">
        <Link href="/" className="absolute right-8 top-8 text-sm font-bold text-[#ff4f6e] hover:underline">Về trang chủ</Link>
        <div className="w-full max-w-[440px]">{children}</div>
      </main>
    </div>
  );
}

function Brand({ inverse = false }: { inverse?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <span className="grid h-11 w-11 place-items-center rounded-2xl bg-[#ff4f6e] text-white shadow-lg shadow-rose-950/20">
        <BookOpenCheck size={23} />
      </span>
      <span className={`text-2xl font-black tracking-tight ${inverse ? 'text-white' : 'text-slate-950'}`}>LectureBridge</span>
    </div>
  );
}
