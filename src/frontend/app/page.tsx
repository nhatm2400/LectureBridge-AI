'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  BookOpenCheck,
  Captions,
  CheckCircle2,
  MessageSquareText,
  SearchCheck,
  Sparkles,
} from 'lucide-react';

const capabilities = [
  {
    icon: Captions,
    title: 'Transcript song ngữ',
    description: 'Chuyển lời giảng thành văn bản có mốc thời gian và hỗ trợ tiếng Việt, tiếng Anh.',
  },
  {
    icon: SearchCheck,
    title: 'Lecture Intelligence',
    description: 'Nhận diện cấu trúc bài giảng, điểm nhấn và bằng chứng nguồn theo từng đoạn.',
  },
  {
    icon: MessageSquareText,
    title: 'Hỏi đáp có căn cứ',
    description: 'Câu trả lời liên kết về đúng ngữ cảnh trong transcript để người học kiểm chứng.',
  },
];

export default function LandingPage() {
  const router = useRouter();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#fffafb] text-slate-950">
      <nav className={`fixed inset-x-0 top-0 z-50 transition-all ${scrolled ? 'bg-white/90 shadow-sm backdrop-blur-xl' : 'bg-transparent'}`}>
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5 lg:px-10">
          <a href="#top" className="flex items-center gap-3" aria-label="LectureBridge - trang chủ">
            <span className="grid h-11 w-11 place-items-center rounded-2xl bg-[#ff4f6e] text-white shadow-lg shadow-rose-200">
              <BookOpenCheck size={23} />
            </span>
            <span className="text-xl font-black tracking-tight">LectureBridge</span>
          </a>
          <div className="flex items-center gap-3">
            <a href="#capabilities" className="hidden px-4 py-2 text-sm font-bold text-slate-600 hover:text-[#ff4f6e] sm:block">
              Khả năng
            </a>
            <button
              type="button"
              onClick={() => router.push('/auth/login')}
              className="rounded-xl bg-[#ff4f6e] px-5 py-3 text-sm font-extrabold text-white shadow-lg shadow-rose-200 transition hover:bg-[#e94664]"
            >
              Đăng nhập
            </button>
          </div>
        </div>
      </nav>

      <main id="top">
        <section className="relative mx-auto grid min-h-[760px] max-w-7xl items-center gap-16 px-6 pb-24 pt-36 lg:grid-cols-[1.05fr_.95fr] lg:px-10">
          <div className="pointer-events-none absolute right-0 top-24 h-96 w-96 rounded-full bg-rose-200/40 blur-3xl" />
          <div className="relative z-10 space-y-9">
            <div className="inline-flex items-center gap-2 rounded-full border border-rose-200 bg-white px-4 py-2 text-xs font-extrabold uppercase tracking-[0.16em] text-[#e94664]">
              <Sparkles size={15} />
              Học từ bài giảng, có thể kiểm chứng
            </div>
            <div className="space-y-6">
              <h1 className="max-w-3xl text-5xl font-black leading-[1.05] tracking-[-0.04em] md:text-7xl">
                Biến bài giảng dài thành <span className="text-[#ff4f6e]">kiến thức có cấu trúc.</span>
              </h1>
              <p className="max-w-2xl text-lg font-medium leading-8 text-slate-600 md:text-xl">
                LectureBridge kết nối transcript, timeline ngữ nghĩa, hỏi đáp có căn cứ và hoạt động ôn tập trong một trải nghiệm học tập dễ tiếp cận.
              </p>
            </div>
            <button
              type="button"
              onClick={() => router.push('/auth/login')}
              className="inline-flex items-center gap-3 rounded-2xl bg-slate-950 px-7 py-4 text-base font-extrabold text-white shadow-xl transition hover:-translate-y-0.5 hover:bg-slate-800"
            >
              Bắt đầu học
              <ArrowRight size={19} />
            </button>
          </div>

          <div className="relative z-10">
            <div className="rounded-[40px] border border-white bg-white/85 p-6 shadow-2xl shadow-slate-200/70 backdrop-blur-xl md:p-9">
              <div className="mb-8 flex items-center justify-between">
                <div>
                  <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-[#ff4f6e]">Bài giảng đang học</p>
                  <h2 className="mt-2 text-2xl font-black">Cấu trúc dữ liệu và giải thuật</h2>
                </div>
                <span className="grid h-12 w-12 place-items-center rounded-2xl bg-rose-50 text-[#ff4f6e]">
                  <Captions size={24} />
                </span>
              </div>
              <div className="space-y-4">
                {[
                  ['02:14', 'Khái niệm và mục tiêu của bài học'],
                  ['08:36', 'Ví dụ trực quan về độ phức tạp'],
                  ['17:05', 'Tổng kết và câu hỏi tự kiểm tra'],
                ].map(([time, label], index) => (
                  <div key={time} className={`flex items-center gap-4 rounded-2xl border p-4 ${index === 1 ? 'border-rose-200 bg-rose-50' : 'border-slate-100 bg-slate-50'}`}>
                    <span className="rounded-xl bg-white px-3 py-2 text-xs font-black text-[#ff4f6e] shadow-sm">{time}</span>
                    <span className="font-bold text-slate-700">{label}</span>
                  </div>
                ))}
              </div>
              <div className="mt-7 rounded-2xl bg-slate-950 p-5 text-white">
                <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-rose-300">Câu trả lời có căn cứ</p>
                <p className="mt-2 font-semibold leading-7 text-slate-200">Mỗi kết luận đều dẫn về đoạn transcript và mốc thời gian liên quan.</p>
              </div>
            </div>
          </div>
        </section>

        <section id="capabilities" className="bg-white py-24">
          <div className="mx-auto max-w-7xl px-6 lg:px-10">
            <div className="mx-auto mb-14 max-w-3xl text-center">
              <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-[#ff4f6e]">Nền tảng học tập nguồn-aware</p>
              <h2 className="mt-4 text-4xl font-black tracking-tight md:text-5xl">Tập trung vào điều người học cần để hiểu và kiểm chứng</h2>
            </div>
            <div className="grid gap-6 md:grid-cols-3">
              {capabilities.map((item) => (
                <article key={item.title} className="rounded-[32px] border border-slate-100 bg-slate-50 p-8 transition hover:-translate-y-1 hover:border-rose-200 hover:bg-white hover:shadow-xl">
                  <span className="grid h-14 w-14 place-items-center rounded-2xl bg-white text-[#ff4f6e] shadow-sm">
                    <item.icon size={27} />
                  </span>
                  <h3 className="mt-7 text-xl font-black">{item.title}</h3>
                  <p className="mt-3 font-medium leading-7 text-slate-600">{item.description}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="px-6 py-24 lg:px-10">
          <div className="mx-auto grid max-w-7xl gap-12 rounded-[40px] bg-slate-950 p-8 text-white md:p-14 lg:grid-cols-2">
            <div>
              <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-rose-300">Thiết kế có trách nhiệm</p>
              <h2 className="mt-4 text-4xl font-black tracking-tight">AI hỗ trợ việc học, không thay thế phán đoán của con người.</h2>
            </div>
            <ul className="space-y-5">
              {['Hiển thị nguồn và độ tin cậy của nội dung sinh.', 'Cho phép người dùng phản hồi và yêu cầu xem xét.', 'Tôn trọng quyền riêng tư trong luồng xử lý dữ liệu.'].map((item) => (
                <li key={item} className="flex items-start gap-3 font-semibold leading-7 text-slate-200">
                  <CheckCircle2 className="mt-1 shrink-0 text-rose-300" size={19} />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-100 bg-white px-6 py-10 lg:px-10">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 text-sm font-semibold text-slate-500 sm:flex-row sm:items-center sm:justify-between">
          <span>© 2026 LectureBridge</span>
          <span>Lecture intelligence for accountable learning</span>
        </div>
      </footer>
    </div>
  );
}
