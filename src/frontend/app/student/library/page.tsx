'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { BookOpen, CheckCircle, Clock, Library, RotateCcw, Trophy } from 'lucide-react';
import Link from 'next/link';
import { CourseThumbnail } from '@/components/ui/CourseThumbnail';
import { api, type Course, type StudentDashboard } from '@/lib/api';
import { getFullImageUrl } from '@/lib/utils';

function normalizeCourseDescription(description?: string | null): string {
  const raw = (description || '').trim();
  if (!raw) return '';
  if (raw.toLowerCase().includes('khu tự học cá nhân cho video học sinh tự tải lên')) {
    return 'Không gian tự học cá nhân cho các video bạn tự tải lên.';
  }
  return raw;
}

function formatHours(seconds: number) {
  return `${Math.round((seconds / 3600) * 10) / 10}h`;
}

export default function StudentDashboardPage() {
  const [dashboard, setDashboard] = useState<StudentDashboard | null>(null);
  const [publicCourses, setPublicCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAllIncomplete, setShowAllIncomplete] = useState(false);
  const [showAllQuizScores, setShowAllQuizScores] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [dashboardData, coursesData] = await Promise.all([
          api.student.getDashboard().catch(() => null),
          api.courses.listCourses().catch(() => []),
        ]);
        setDashboard(dashboardData);
        setPublicCourses(coursesData);
      } catch (err) {
        console.error('Failed to fetch student dashboard', err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const stats = useMemo(() => {
    const s = dashboard?.stats;
    return [
      { label: 'Khóa đang học', value: s?.active_courses ?? 0, icon: Library },
      { label: 'Bài đã hoàn thành', value: s?.completed_lessons ?? 0, icon: CheckCircle },
      { label: 'Thời lượng đã xem', value: formatHours(s?.total_watch_seconds ?? 0), icon: Clock },
      { label: 'Điểm quiz TB', value: `${s?.average_quiz_score ?? 0}%`, icon: Trophy },
    ];
  }, [dashboard]);

  const availableCourses = useMemo(() => {
    const enrolledIds = new Set((dashboard?.courses ?? []).map((course) => course.course_id));
    return publicCourses.filter((course) => !enrolledIds.has(course.id) && course.title !== 'Tu hoc ca nhan');
  }, [dashboard, publicCourses]);

  return (
    <div className="min-h-screen bg-bg-main">
      <div className="mx-auto max-w-7xl space-y-8 px-6 py-10 md:px-10">
        <div className="hidden">
          <p className="text-xs font-extrabold uppercase tracking-widest text-[#FF4F6E]">BẢNG ĐIỀU KHIỂN</p>
          <h1 className="text-3xl font-extrabold text-slate-900">Tiến độ học tập</h1>
          <p className="max-w-2xl text-sm font-bold text-slate-500">
            Theo dõi khóa đang học, bài chưa hoàn thành, thẻ ghi nhớ và kết quả quiz gần đây.
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-extrabold text-slate-900 md:text-3xl">Tiến độ học tập</h1>
          <p className="max-w-2xl text-sm font-semibold leading-6 text-slate-600">
            Theo dõi khóa đang học, bài chưa hoàn thành, thẻ ghi nhớ và kết quả quiz gần đây.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          {stats.map((stat) => (
            <div key={stat.label} className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
              <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-[#FF4F6E]/10 text-[#FF4F6E]">
                <stat.icon size={20} />
              </div>
              <p className="text-xs font-bold uppercase tracking-widest text-slate-400">{stat.label}</p>
              <p className="mt-1 text-2xl font-extrabold text-slate-900">{stat.value}</p>
            </div>
          ))}
        </div>

        {loading ? (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-64 animate-pulse rounded-2xl border border-slate-100 bg-white" />
            ))}
          </div>
        ) : !dashboard || dashboard.courses.length === 0 ? (
          <div className="rounded-2xl border border-slate-100 bg-white p-12 text-center">
            <p className="font-bold text-slate-400">Bạn chưa có khóa học nào.</p>
            <Link href="/student/upload" className="mt-4 inline-block font-extrabold text-[#FF4F6E] underline">
              Tải video lên để bắt đầu
            </Link>
          </div>
        ) : (
          <div className="grid gap-8 lg:grid-cols-3">
            <section className="space-y-5 lg:col-span-2">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-extrabold text-slate-900">Khóa học của tôi</h2>
              </div>
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                {dashboard.courses.map((course) => (
                  <div key={course.course_id} className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
                    <div className="relative aspect-video">
                      <CourseThumbnail src={getFullImageUrl(course.thumbnail_url)} alt={course.title} />
                    </div>
                    <div className="space-y-4 p-5">
                      <div className="flex items-center justify-between gap-3">
                        <h3 className="line-clamp-2 text-sm font-extrabold text-slate-900">{course.title}</h3>
                        <span className="rounded-full bg-slate-50 px-3 py-1 text-[10px] font-extrabold uppercase tracking-widest text-slate-500">
                          {course.enrollment_status}
                        </span>
                      </div>
                      <div>
                        <div className="mb-2 flex justify-between text-xs font-bold text-slate-500">
                          <span>{course.completed_lessons}/{course.total_lessons} bài</span>
                          <span>{course.progress_percent}%</span>
                        </div>
                        <div className="h-2 rounded-full bg-slate-100">
                          <div className="h-full rounded-full bg-[#FF4F6E]" style={{ width: `${course.progress_percent}%` }} />
                        </div>
                      </div>
                      <Link
                        href={`/student/courses/${course.course_id}`}
                        className="block rounded-xl bg-slate-900 py-3 text-center text-xs font-extrabold uppercase tracking-widest text-white transition-colors hover:bg-[#FF4F6E]"
                      >
                        Xem khóa học
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <aside className="space-y-6">
              <section className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
                <h2 className="mb-5 flex items-center gap-2 text-lg font-extrabold text-slate-900">
                  <RotateCcw size={18} className="text-[#FF4F6E]" />
                  Học tiếp
                </h2>
                <div className="space-y-4">
                  {dashboard.incomplete_lessons.length === 0 ? (
                    <p className="text-sm font-bold text-slate-400">Không có bài đang dở.</p>
                  ) : (
                    (showAllIncomplete ? dashboard.incomplete_lessons : dashboard.incomplete_lessons.slice(0, 3)).map((lesson) => (
                      <Link key={lesson.lesson_id} href={`/student/videos/${lesson.lesson_id}`} className="block rounded-xl border border-slate-100 p-4 transition-colors hover:border-[#FF4F6E]/30 hover:bg-rose-50/40">
                        <p className="line-clamp-1 text-sm font-extrabold text-slate-900">{lesson.title}</p>
                        <p className="mt-1 text-xs font-bold text-slate-500">
                          {lesson.progress_percent}% - tiếp tục tại {Math.round(lesson.last_position_seconds)}s
                        </p>
                      </Link>
                    ))
                  )}
                  {dashboard.incomplete_lessons.length > 3 && (
                    <button
                      onClick={() => setShowAllIncomplete(!showAllIncomplete)}
                      className="mt-2 w-full text-center text-xs font-extrabold text-[#FF4F6E] hover:underline"
                    >
                      {showAllIncomplete ? 'Thu gọn' : `Xem thêm (${dashboard.incomplete_lessons.length - 3} bài khác)`}
                    </button>
                  )}
                </div>
              </section>

              <section className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
                <h2 className="mb-5 flex items-center gap-2 text-lg font-extrabold text-slate-900">
                  <BookOpen size={18} className="text-[#FF4F6E]" />
                  Quiz gần đây
                </h2>
                <div className="space-y-4">
                  {dashboard.quiz_scores.length === 0 ? (
                    <p className="text-sm font-bold text-slate-400">Chưa có kết quả quiz.</p>
                  ) : (
                    (showAllQuizScores ? dashboard.quiz_scores : dashboard.quiz_scores.slice(0, 3)).map((quiz) => (
                      <div key={`${quiz.quiz_id}-${quiz.created_at}`} className="flex items-center justify-between gap-4 rounded-xl bg-slate-50 p-4">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-extrabold text-slate-900">{quiz.title}</p>
                          <p className="text-xs font-bold text-slate-500">{quiz.status}</p>
                        </div>
                        <span className="text-sm font-extrabold text-[#FF4F6E]">{quiz.score}%</span>
                      </div>
                    ))
                  )}
                  {dashboard.quiz_scores.length > 3 && (
                    <button
                      onClick={() => setShowAllQuizScores(!showAllQuizScores)}
                      className="mt-2 w-full text-center text-xs font-extrabold text-[#FF4F6E] hover:underline"
                    >
                      {showAllQuizScores ? 'Thu gọn' : `Xem thêm (${dashboard.quiz_scores.length - 3} quiz khác)`}
                    </button>
                  )}
                </div>
              </section>
            </aside>
          </div>
        )}

        {!loading && availableCourses.length > 0 && (
          <section className="space-y-5">
            <div className="flex flex-col gap-1">
              <p className="text-xs font-extrabold uppercase tracking-widest text-[#FF4F6E]">DANH MỤC KHÓA HỌC</p>
              <h2 className="text-xl font-extrabold text-slate-900">Khóa học có thể đăng ký</h2>
              <p className="text-sm font-bold text-slate-500">
                Các khóa học được giáo viên hoặc admin xuất bản sẽ xuất hiện ở đây để học sinh đăng ký.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
              {availableCourses.map((course) => (
                <div key={course.id} className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
                  <div className="relative aspect-video">
                    <CourseThumbnail
                      src={getFullImageUrl(course.thumbnail_url || course.cover_image_url || course.thumb)}
                      alt={course.title}
                    />
                  </div>
                  <div className="space-y-4 p-5">
                    <div>
                      <h3 className="line-clamp-2 text-sm font-extrabold text-slate-900">{course.title}</h3>
                      {course.description && (
                        <p className="mt-2 line-clamp-2 text-xs font-bold leading-5 text-slate-500">{normalizeCourseDescription(course.description)}</p>
                      )}
                    </div>
                    <Link
                      href={`/student/courses/${course.id}`}
                      className="block rounded-xl bg-[#FF4F6E] py-3 text-center text-xs font-extrabold uppercase tracking-widest text-white transition-colors hover:bg-slate-900"
                    >
                      Xem và đăng ký
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
