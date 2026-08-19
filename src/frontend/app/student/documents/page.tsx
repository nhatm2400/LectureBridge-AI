'use client';

import React from 'react';
import Link from 'next/link';
import { CourseThumbnail } from '@/components/ui/CourseThumbnail';
import { api, type Course, type StudentDashboard } from '@/lib/api';
import { cn, getFullImageUrl } from '@/lib/utils';

type CourseTab = 'enrolled' | 'active' | 'completed';

type CourseCard = {
  id: string;
  title: string;
  instructor: string;
  category: string;
  thumbnail: string | null;
  progressPercent: number;
  completedLessons: number;
  totalLessons: number;
  enrollmentStatus: string;
};

const PAGE_SIZE = 6;
const DEFAULT_INSTRUCTOR = 'Giảng viên';
const DEFAULT_CATEGORY = 'Course';

function normalizeCourseCards(dashboard: StudentDashboard, courses: Course[]): CourseCard[] {
  const byId = new Map(courses.map((item) => [item.id, item]));
  return dashboard.courses.map((enrolled) => {
    const detail = byId.get(enrolled.course_id);
    return {
      id: enrolled.course_id,
      title: enrolled.title,
      instructor: DEFAULT_INSTRUCTOR,
      category: detail?.cat || DEFAULT_CATEGORY,
      thumbnail: getFullImageUrl(
        detail?.thumbnail_url ||
        detail?.cover_image_url ||
        detail?.thumb ||
        enrolled.thumbnail_url
      ) || null,
      progressPercent: enrolled.progress_percent,
      completedLessons: enrolled.completed_lessons,
      totalLessons: enrolled.total_lessons,
      enrollmentStatus: enrolled.enrollment_status,
    };
  });
}

export default function EnrolledCourses() {
  const [mounted, setMounted] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [activeTab, setActiveTab] = React.useState<CourseTab>('enrolled');
  const [currentPage, setCurrentPage] = React.useState(1);
  const [cards, setCards] = React.useState<CourseCard[]>([]);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  React.useEffect(() => {
    const fetchData = async () => {
      try {
        const [dashboard, courses] = await Promise.all([api.student.getDashboard(), api.courses.listCourses()]);
        setCards(normalizeCourseCards(dashboard, courses));
      } catch (error) {
        console.error('Failed to load enrolled courses', error);
        setCards([]);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const filteredCards = React.useMemo(() => {
    if (activeTab === 'active') {
      return cards.filter((item) => item.progressPercent > 0 && item.progressPercent < 100);
    }
    if (activeTab === 'completed') {
      return cards.filter((item) => item.progressPercent >= 100);
    }
    return cards;
  }, [activeTab, cards]);

  const tabCounts = React.useMemo(
    () => ({
      enrolled: cards.length,
      active: cards.filter((item) => item.progressPercent > 0 && item.progressPercent < 100).length,
      completed: cards.filter((item) => item.progressPercent >= 100).length,
    }),
    [cards]
  );

  const totalPages = Math.max(1, Math.ceil(filteredCards.length / PAGE_SIZE));

  React.useEffect(() => {
    setCurrentPage(1);
  }, [activeTab]);

  React.useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const pagedCards = React.useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredCards.slice(start, start + PAGE_SIZE);
  }, [filteredCards, currentPage]);

  if (!mounted) {
    return (
      <div className="min-h-screen bg-transparent">
        <div className="mx-auto max-w-7xl space-y-8 px-6 py-10 md:px-10">
          <div className="h-10 w-56 animate-pulse rounded-xl bg-slate-100" />
          <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((item) => (
              <div key={item} className="h-[320px] animate-pulse rounded-2xl border border-slate-100 bg-white" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-transparent">
      <div className="mx-auto max-w-7xl space-y-8 px-6 py-10 md:px-10">
        <div className="flex flex-col gap-6 border-b border-slate-100 pb-6 md:flex-row md:items-center md:justify-between">
          <h1 className="text-2xl font-extrabold text-slate-900 md:text-3xl">
            {activeTab === 'enrolled' ? 'Đã đăng ký' : activeTab === 'active' ? 'Đang học' : 'Hoàn thành'}
          </h1>
          <div className="flex items-center gap-2">
            {[
              { id: 'enrolled' as const, label: `Đã đăng ký (${tabCounts.enrolled})` },
              { id: 'active' as const, label: `Đang học (${tabCounts.active})` },
              { id: 'completed' as const, label: `Hoàn thành (${tabCounts.completed})` },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'rounded-full px-4 py-1.5 text-[11px] font-extrabold uppercase tracking-widest transition-all',
                  activeTab === tab.id
                    ? 'bg-primary text-white shadow-lg shadow-primary/20'
                    : 'bg-slate-100 text-slate-400 hover:bg-slate-200'
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3, 4, 5, 6].map((item) => (
              <div key={item} className="h-[360px] animate-pulse rounded-2xl border border-slate-100 bg-white" />
            ))}
          </div>
        ) : filteredCards.length === 0 ? (
          <div className="rounded-2xl border border-slate-100 bg-white p-12 text-center">
            <p className="font-bold text-slate-400">Chưa có khóa học phù hợp trong mục này.</p>
            <Link href="/student/library" className="mt-4 inline-block font-extrabold text-[#FF4F6E] underline">
              Đi tới thư viện khóa học
            </Link>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3">
              {pagedCards.map((course) => (
                <div key={course.id} className="group overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
                  <div className="relative aspect-video">
                    <CourseThumbnail src={course.thumbnail} alt={course.title} />
                  </div>
                  <div className="space-y-4 p-6">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-400">{course.instructor}</span>
                      <span className="rounded border border-slate-100 bg-slate-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        {course.category}
                      </span>
                    </div>
                    <h4 className="min-h-[40px] line-clamp-2 text-sm font-extrabold leading-snug text-slate-900">{course.title}</h4>
                    <div>
                      <div className="mb-1 flex justify-between text-[11px] font-bold text-slate-500">
                        <span>
                          {course.completedLessons}/{course.totalLessons} bài
                        </span>
                        <span>{course.progressPercent}%</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-slate-100">
                        <div className="h-full rounded-full bg-[#FF4F6E]" style={{ width: `${course.progressPercent}%` }} />
                      </div>
                    </div>
                    <Link
                      href={`/student/courses/${course.id}`}
                      className="block w-full rounded-lg bg-slate-900 py-2.5 text-center text-[11px] font-extrabold uppercase tracking-widest text-white transition-colors hover:bg-primary"
                    >
                      Xem khóa học
                    </Link>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between border-t border-slate-50 pt-10">
              <p className="text-xs font-bold uppercase tracking-widest text-slate-400">
                Trang {currentPage} / {totalPages}
              </p>
              <div className="flex items-center gap-2">
                {Array.from({ length: totalPages }, (_, index) => index + 1).map((num) => (
                  <button
                    key={num}
                    onClick={() => setCurrentPage(num)}
                    className={cn(
                      'flex h-8 w-8 items-center justify-center rounded-full text-xs font-extrabold transition-all',
                      currentPage === num
                        ? 'bg-primary text-white shadow-lg shadow-primary/20'
                        : 'bg-slate-100 text-slate-400 hover:bg-slate-200'
                    )}
                  >
                    {num}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
