'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { ClipboardList, Trophy } from 'lucide-react';
import { api, type StudentDashboard } from '@/lib/api';
import { localeCode, useI18n } from '@/lib/i18n';

export default function StudentQuizAttemptsPage() {
  const { locale, t } = useI18n();
  const [dashboard, setDashboard] = useState<StudentDashboard | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const run = async () => {
      try {
        const data = await api.student.getDashboard();
        setDashboard(data);
      } catch (err) {
        console.error('Failed to fetch quiz attempts', err);
      } finally {
        setLoading(false);
      }
    };
    run();
  }, []);

  return (
    <div className="min-h-screen bg-bg-main">
      <div className="mx-auto max-w-6xl space-y-6 px-6 py-10 md:px-10">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 md:text-3xl">{t('Lượt làm bài quiz', 'Quiz attempts')}</h1>
          <p className="mt-2 text-sm font-semibold text-slate-600">{t('Theo dõi lịch sử quiz gần đây và điểm số đạt được.', 'Review your recent quiz history and scores.')}</p>
        </div>

        {loading ? (
          <div className="rounded-2xl border border-slate-100 bg-white p-8 text-sm font-bold text-slate-400">{t('Đang tải dữ liệu...', 'Loading data...')}</div>
        ) : !dashboard || dashboard.quiz_scores.length === 0 ? (
          <div className="rounded-2xl border border-slate-100 bg-white p-10 text-center">
            <ClipboardList size={28} className="mx-auto mb-3 text-slate-300" />
            <p className="text-sm font-bold text-slate-400">{t('Chưa có lượt làm quiz nào.', 'No quiz attempts yet.')}</p>
            <p className="text-xs font-bold text-slate-400 mt-2">{t('Vào trang video bài học để bắt đầu làm quiz.', 'Open a lesson video to start a quiz.')}</p>
          </div>
        ) : (
          <div className="rounded-2xl border border-slate-100 bg-white overflow-hidden shadow-sm">
            <div className="grid grid-cols-12 bg-slate-50 px-6 py-3 text-[11px] font-extrabold uppercase tracking-wider text-slate-500">
              <div className="col-span-6">{t('Bài kiểm tra', 'Quiz')}</div>
              <div className="col-span-2">{t('Trạng thái', 'Status')}</div>
              <div className="col-span-2">{t('Điểm', 'Score')}</div>
              <div className="col-span-2 text-right">{t('Thời gian', 'Time')}</div>
            </div>
            <div className="divide-y divide-slate-100">
              {dashboard.quiz_scores.map((q, idx) => (
                <div key={`${q.quiz_id}-${q.created_at}-${idx}`} className="grid grid-cols-12 items-center px-6 py-4">
                  <div className="col-span-6 min-w-0">
                    <p className="truncate text-sm font-extrabold text-slate-900">{q.title}</p>
                    <p className="text-xs font-bold text-slate-400">{q.quiz_id}</p>
                  </div>
                  <div className="col-span-2 text-xs font-bold text-slate-600">{q.status}</div>
                  <div className="col-span-2">
                    <span className="inline-flex items-center gap-1 text-sm font-extrabold text-[#FF4F6E]">
                      <Trophy size={14} />
                      {q.score}%
                    </span>
                  </div>
                  <div className="col-span-2 text-right text-xs font-bold text-slate-400">
                    {new Date(q.created_at).toLocaleString(localeCode(locale))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div>
          <Link href="/student/library" className="text-xs font-extrabold uppercase tracking-wider text-[#FF4F6E] hover:underline">
            {t('Quay lại tổng quan', 'Back to dashboard')}
          </Link>
        </div>
      </div>
    </div>
  );
}
