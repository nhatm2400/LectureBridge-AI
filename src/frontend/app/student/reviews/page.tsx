'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { MessageSquare, Star } from 'lucide-react';
import { api, type MyReviewItem } from '@/lib/api';

export default function StudentReviewsPage() {
  const [items, setItems] = useState<MyReviewItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const run = async () => {
      try {
        const res = await api.student.listMyReviews();
        setItems(res.items || []);
      } catch (err) {
        console.error('Failed to fetch my reviews', err);
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
          <h1 className="text-2xl font-extrabold text-slate-900 md:text-3xl">Đánh giá của tôi</h1>
          <p className="mt-2 text-sm font-semibold text-slate-600">Danh sách đánh giá bạn đã gửi cho các khóa học.</p>
        </div>

        {loading ? (
          <div className="rounded-2xl border border-slate-100 bg-white p-8 text-sm font-bold text-slate-400">Đang tải dữ liệu...</div>
        ) : items.length === 0 ? (
          <div className="rounded-2xl border border-slate-100 bg-white p-10 text-center">
            <MessageSquare size={28} className="mx-auto mb-3 text-slate-300" />
            <p className="text-sm font-bold text-slate-400">Bạn chưa gửi đánh giá nào.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {items.map((item) => (
              <div key={item.id} className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
                <div className="flex items-center justify-between gap-4">
                  <Link href={`/student/courses/${item.course_id}`} className="text-sm font-extrabold text-slate-900 hover:text-[#FF4F6E]">
                    {item.course_title}
                  </Link>
                  <span className="text-xs font-bold text-slate-400">{new Date(item.updated_at).toLocaleString('vi-VN')}</span>
                </div>
                <div className="flex items-center gap-1 text-amber-400 my-2">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <Star key={i} size={14} fill={i <= item.rating ? 'currentColor' : 'none'} className={i <= item.rating ? '' : 'text-slate-300'} />
                  ))}
                </div>
                <p className="text-sm font-medium text-slate-600 whitespace-pre-wrap">{item.comment || 'Không có nhận xét.'}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
