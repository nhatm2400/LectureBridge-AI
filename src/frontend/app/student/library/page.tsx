'use client';

import { ArrowRight, BookOpen, CheckCircle, Clock, Library, Play, Trophy } from 'lucide-react';
import Link from 'next/link';
import React, { useEffect, useMemo, useState } from 'react';

import { buttonClassName } from '@/components/ui/Button';
import { CourseThumbnail } from '@/components/ui/CourseThumbnail';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatePanel } from '@/components/ui/StatePanel';
import { Surface } from '@/components/ui/Surface';
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

function formatPosition(seconds: number) {
  const safe = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(safe / 60);
  const remainder = safe % 60;
  return `${minutes}:${remainder.toString().padStart(2, '0')}`;
}

export default function StudentDashboardPage() {
  const [dashboard, setDashboard] = useState<StudentDashboard | null>(null);
  const [publicCourses, setPublicCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [showAllIncomplete, setShowAllIncomplete] = useState(false);
  const [showAllQuizScores, setShowAllQuizScores] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      const [dashboardResult, coursesResult] = await Promise.allSettled([
        api.student.getDashboard(),
        api.courses.listCourses(),
      ]);
      if (dashboardResult.status === 'fulfilled') setDashboard(dashboardResult.value);
      if (coursesResult.status === 'fulfilled') setPublicCourses(coursesResult.value);
      setLoadError(dashboardResult.status === 'rejected');
      setLoading(false);
    };
    void fetchData();
  }, []);

  const stats = useMemo(() => {
    const summary = dashboard?.stats;
    return [
      { label: 'Khóa đang học', value: summary?.active_courses ?? 0, icon: Library },
      { label: 'Bài hoàn thành', value: summary?.completed_lessons ?? 0, icon: CheckCircle },
      { label: 'Đã xem', value: formatHours(summary?.total_watch_seconds ?? 0), icon: Clock },
      { label: 'Quiz trung bình', value: `${summary?.average_quiz_score ?? 0}%`, icon: Trophy },
    ];
  }, [dashboard]);

  const availableCourses = useMemo(() => {
    const enrolledIds = new Set((dashboard?.courses ?? []).map((course) => course.course_id));
    return publicCourses.filter((course) => !enrolledIds.has(course.id) && course.title !== 'Tu hoc ca nhan');
  }, [dashboard, publicCourses]);

  const incompleteLessons = dashboard?.incomplete_lessons ?? [];
  const primaryLesson = incompleteLessons[0];
  const remainingLessons = incompleteLessons.slice(1);

  return (
    <div className="min-h-screen bg-[var(--lb-canvas)]">
      <div className="mx-auto max-w-[1440px] space-y-10 px-5 py-8 sm:px-8 lg:px-10 lg:py-10">
        <PageHeader
          eyebrow="Không gian học"
          title="Tiếp tục từ nơi bạn dừng lại"
          description="Mở lại bài đang học, theo dõi tiến độ và quay về đúng mạch bài giảng khi bạn bỏ lỡ một đoạn."
          action={<Link href="/student/upload" className={buttonClassName({ variant: 'secondary' })}>Tải video lên</Link>}
        />

        {loading ? (
          <StatePanel state="loading" title="Đang chuẩn bị thư viện" description="LectureBridge đang tải tiến độ và các bài giảng của bạn." />
        ) : loadError || !dashboard ? (
          <StatePanel state="error" title="Chưa thể tải tiến độ học" description="Vui lòng tải lại trang hoặc kiểm tra kết nối với máy chủ." action={<button type="button" onClick={() => window.location.reload()} className={buttonClassName()}>Tải lại</button>} />
        ) : (
          <>
            <section aria-labelledby="continue-heading">
              <div className="mb-4 flex items-end justify-between gap-4">
                <div>
                  <p className="text-xs font-bold tracking-[0.1em] text-[var(--lb-accent)]">ƯU TIÊN</p>
                  <h2 id="continue-heading" className="mt-1 text-2xl">Học tiếp</h2>
                </div>
                {remainingLessons.length > 0 && (
                  <button type="button" onClick={() => setShowAllIncomplete((current) => !current)} className="min-h-11 rounded-md px-3 text-sm font-bold text-[var(--lb-accent)] hover:bg-[var(--lb-accent-soft)]">
                    {showAllIncomplete ? 'Thu gọn' : `Xem thêm ${remainingLessons.length} bài`}
                  </button>
                )}
              </div>

              {primaryLesson ? (
                <div className="grid gap-4 lg:grid-cols-[minmax(0,1.45fr)_minmax(280px,.55fr)]">
                  <Surface className="grid overflow-hidden md:grid-cols-[minmax(220px,.8fr)_1.2fr]">
                    <div className="flex min-h-48 items-center justify-center bg-[var(--lb-accent-soft)] text-[var(--lb-accent)]">
                      <Play size={38} strokeWidth={1.5} aria-hidden="true" />
                    </div>
                    <div className="flex flex-col justify-between p-6 sm:p-8">
                      <div>
                        <span className="rounded-full border border-[var(--lb-border)] bg-[var(--lb-elevated)] px-3 py-1 text-xs font-bold text-[var(--lb-muted)]">Đang học · {primaryLesson.progress_percent}%</span>
                        <h3 className="mt-5 text-2xl leading-tight">{primaryLesson.title}</h3>
                        <p className="mt-3 text-sm text-[var(--lb-muted)]">Tiếp tục tại {formatPosition(primaryLesson.last_position_seconds)}</p>
                      </div>
                      <Link href={`/student/videos/${primaryLesson.lesson_id}`} className={buttonClassName({ className: 'mt-7 w-full sm:w-fit' })}>
                        Mở bài giảng <ArrowRight size={18} aria-hidden="true" />
                      </Link>
                    </div>
                  </Surface>

                  <Surface className="p-5">
                    <h3 className="text-base">Các bài đang dở</h3>
                    {remainingLessons.length === 0 ? (
                      <p className="mt-4 text-sm leading-6 text-[var(--lb-muted)]">Chỉ còn bài hiện tại. Hoàn thành bài để cập nhật tiến độ.</p>
                    ) : (
                      <div className="mt-3 divide-y divide-[var(--lb-border)]">
                        {(showAllIncomplete ? remainingLessons : remainingLessons.slice(0, 3)).map((lesson) => (
                          <Link key={lesson.lesson_id} href={`/student/videos/${lesson.lesson_id}`} className="group flex min-h-16 items-center justify-between gap-3 py-3">
                            <span className="min-w-0">
                              <span className="block truncate text-sm font-semibold text-[var(--lb-ink)] group-hover:text-[var(--lb-accent)]">{lesson.title}</span>
                              <span className="mt-1 block text-xs text-[var(--lb-muted)]">{lesson.progress_percent}% · {formatPosition(lesson.last_position_seconds)}</span>
                            </span>
                            <ArrowRight size={17} className="shrink-0 text-[var(--lb-subtle)]" aria-hidden="true" />
                          </Link>
                        ))}
                      </div>
                    )}
                  </Surface>
                </div>
              ) : (
                <StatePanel state="empty" title="Không có bài đang dở" description="Chọn một khóa học bên dưới hoặc tải video của bạn lên để bắt đầu." action={<Link href="/student/upload" className={buttonClassName()}>Tải video lên</Link>} />
              )}
            </section>

            <section aria-labelledby="overview-heading">
              <h2 id="overview-heading" className="mb-4 text-lg">Tổng quan tiến độ</h2>
              <div className="grid overflow-hidden rounded-[10px] border border-[var(--lb-border)] bg-[var(--lb-surface)] sm:grid-cols-2 lg:grid-cols-4">
                {stats.map((stat, index) => (
                  <div key={stat.label} className={`flex items-center gap-4 p-5 ${index < stats.length - 1 ? 'border-b border-[var(--lb-border)] sm:border-r lg:border-b-0' : ''} ${index === 1 ? 'lg:border-b-0' : ''}`}>
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-[var(--lb-accent-soft)] text-[var(--lb-accent)]"><stat.icon size={19} aria-hidden="true" /></span>
                    <div>
                      <p className="text-2xl font-bold text-[var(--lb-ink)]">{stat.value}</p>
                      <p className="text-xs text-[var(--lb-muted)]">{stat.label}</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_320px]">
              <section aria-labelledby="my-courses-heading">
                <div className="mb-4">
                  <h2 id="my-courses-heading" className="text-2xl">Khóa học của tôi</h2>
                  <p className="mt-1 text-sm text-[var(--lb-muted)]">Chọn một khóa để xem bài học và tiến độ chi tiết.</p>
                </div>
                {dashboard.courses.length === 0 ? (
                  <StatePanel state="empty" title="Bạn chưa có khóa học" description="Các khóa bạn đăng ký sẽ xuất hiện tại đây." />
                ) : (
                  <div className="grid gap-5 md:grid-cols-2">
                    {dashboard.courses.map((course) => (
                      <Surface key={course.course_id} as="article" className="overflow-hidden">
                        <div className="relative aspect-[16/8.5] border-b border-[var(--lb-border)]">
                          <CourseThumbnail src={getFullImageUrl(course.thumbnail_url)} alt={course.title} />
                        </div>
                        <div className="p-5">
                          <div className="flex items-start justify-between gap-3">
                            <h3 className="line-clamp-2 text-lg leading-snug">{course.title}</h3>
                            <span className="shrink-0 rounded-full bg-[var(--lb-accent-soft)] px-2.5 py-1 text-xs font-semibold text-[var(--lb-accent)]">{course.enrollment_status}</span>
                          </div>
                          <div className="mt-5">
                            <div className="mb-2 flex justify-between text-xs text-[var(--lb-muted)]">
                              <span>{course.completed_lessons}/{course.total_lessons} bài</span><span>{course.progress_percent}%</span>
                            </div>
                            <div className="h-1.5 overflow-hidden rounded-full bg-[var(--lb-border)]" role="progressbar" aria-label={`Tiến độ ${course.title}`} aria-valuenow={course.progress_percent} aria-valuemin={0} aria-valuemax={100}>
                              <div className="h-full rounded-full bg-[var(--lb-accent)]" style={{ width: `${course.progress_percent}%` }} />
                            </div>
                          </div>
                          <Link href={`/student/courses/${course.course_id}`} className={buttonClassName({ variant: 'secondary', className: 'mt-5 w-full' })}>Xem khóa học</Link>
                        </div>
                      </Surface>
                    ))}
                  </div>
                )}
              </section>

              <aside aria-labelledby="quiz-heading">
                <Surface className="p-5">
                  <div className="flex items-center justify-between gap-3">
                    <h2 id="quiz-heading" className="text-lg">Quiz gần đây</h2>
                    <BookOpen size={18} className="text-[var(--lb-accent)]" aria-hidden="true" />
                  </div>
                  {dashboard.quiz_scores.length === 0 ? (
                    <p className="mt-4 text-sm text-[var(--lb-muted)]">Chưa có kết quả quiz.</p>
                  ) : (
                    <div className="mt-3 divide-y divide-[var(--lb-border)]">
                      {(showAllQuizScores ? dashboard.quiz_scores : dashboard.quiz_scores.slice(0, 4)).map((quiz) => (
                        <div key={`${quiz.quiz_id}-${quiz.created_at}`} className="flex items-center justify-between gap-4 py-3.5">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-[var(--lb-ink)]">{quiz.title}</p>
                            <p className="mt-0.5 text-xs text-[var(--lb-muted)]">{quiz.status}</p>
                          </div>
                          <span className="shrink-0 text-sm font-bold text-[var(--lb-accent)]">{quiz.score}%</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {dashboard.quiz_scores.length > 4 && (
                    <button type="button" onClick={() => setShowAllQuizScores((current) => !current)} className="mt-3 min-h-11 w-full rounded-md text-sm font-bold text-[var(--lb-accent)] hover:bg-[var(--lb-accent-soft)]">
                      {showAllQuizScores ? 'Thu gọn' : `Xem thêm ${dashboard.quiz_scores.length - 4} kết quả`}
                    </button>
                  )}
                </Surface>
              </aside>
            </div>

            {availableCourses.length > 0 && (
              <section className="border-t border-[var(--lb-border)] pt-9" aria-labelledby="catalog-heading">
                <h2 id="catalog-heading" className="text-2xl">Khám phá khóa học</h2>
                <p className="mt-1 text-sm text-[var(--lb-muted)]">Các khóa học đã xuất bản và sẵn sàng để đăng ký.</p>
                <div className="mt-5 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
                  {availableCourses.map((course) => (
                    <Surface key={course.id} as="article" className="overflow-hidden">
                      <div className="relative aspect-video border-b border-[var(--lb-border)]">
                        <CourseThumbnail src={getFullImageUrl(course.thumbnail_url || course.cover_image_url || course.thumb)} alt={course.title} />
                      </div>
                      <div className="p-5">
                        <h3 className="line-clamp-2 text-lg">{course.title}</h3>
                        {course.description && <p className="mt-2 line-clamp-2 text-sm leading-6 text-[var(--lb-muted)]">{normalizeCourseDescription(course.description)}</p>}
                        <Link href={`/student/courses/${course.id}`} className={buttonClassName({ variant: 'secondary', className: 'mt-5 w-full' })}>Xem và đăng ký</Link>
                      </div>
                    </Surface>
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}
