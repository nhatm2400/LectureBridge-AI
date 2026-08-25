'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  CheckCircle,
  ChevronDown,
  Clock,
  Globe,
  Layers,
  MessageSquare,
  MonitorPlay,
  Play,
  Star,
  User as UserIcon,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { CourseThumbnail } from '@/components/ui/CourseThumbnail';
import { api, CourseReview, StudentCourseDetail, StudentCourseDetailLesson } from '@/lib/api';
import { localeCode, useI18n } from '@/lib/i18n';
import { getFullImageUrl } from '@/lib/utils';

function formatDuration(minutes: number): string {
  const h = Math.floor(Math.max(minutes, 0) / 60);
  const m = Math.max(minutes, 0) % 60;
  return `${h}h ${m}m`;
}

function naturalLessonCompare(a: StudentCourseDetailLesson, b: StudentCourseDetailLesson): number {
  const byOrder = (a.sort_order ?? 0) - (b.sort_order ?? 0);
  if (byOrder !== 0) return byOrder;
  return (a.title || '').localeCompare((b.title || ''), 'vi', {
    sensitivity: 'base',
    numeric: true,
  });
}

export default function CourseDetailPage() {
  const params = useParams();
  const courseId = params.id as string;
  const { locale, t } = useI18n();

  const [detail, setDetail] = useState<StudentCourseDetail | null>(null);
  const [activeAccordion, setActiveAccordion] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showEnrollModal, setShowEnrollModal] = useState(false);
  const [reviews, setReviews] = useState<CourseReview[]>([]);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState('');
  const [savingReview, setSavingReview] = useState(false);

  useEffect(() => {
    const run = async () => {
      try {
        const data = await api.student.getCourseDetail(courseId);
        setDetail(data);
        const reviewData = await api.student.listCourseReviews(courseId, 20, 0);
        setReviews(reviewData.items || []);
        if (data.modules.length > 0) setActiveAccordion(data.modules[0].id);
      } catch (err) {
        console.error('Failed to fetch course detail', err);
      } finally {
        setLoading(false);
      }
    };
    run();
  }, [courseId]);

  const handleEnroll = async () => {
    try {
      await api.student.enroll(courseId);
      const data = await api.student.getCourseDetail(courseId);
      setDetail(data);
      const reviewData = await api.student.listCourseReviews(courseId, 20, 0);
      setReviews(reviewData.items || []);
      setShowEnrollModal(true);
      setTimeout(() => setShowEnrollModal(false), 2500);
    } catch (err) {
      console.error('Enrollment failed', err);
    }
  };

  const nextLessonUrl = useMemo(() => {
    if (!detail) return '';
    const target = detail.user_context.next_lesson_id || detail.user_context.first_lesson_id;
    return target ? `/student/videos/${target}` : '';
  }, [detail]);

  const cta = useMemo(() => {
    if (!detail) return { label: t('Đăng ký ngay', 'Enroll now'), href: '', enrolled: false };
    if (!detail.user_context.is_enrolled) {
      return { label: t('Đăng ký ngay', 'Enroll now'), href: '', enrolled: false };
    }
    if (detail.user_context.is_course_completed) {
      return {
        label: t('Xem lại khóa học', 'Review course'),
        href: detail.user_context.first_lesson_id ? `/student/videos/${detail.user_context.first_lesson_id}` : '',
        enrolled: true,
      };
    }
    if (detail.user_context.progress_percent > 0) {
      return { label: t('Học tiếp', 'Continue learning'), href: nextLessonUrl, enrolled: true };
    }
    return { label: t('Bắt đầu học', 'Start learning'), href: nextLessonUrl, enrolled: true };
  }, [detail, nextLessonUrl, t]);

  if (loading) return <div className="min-h-screen flex items-center justify-center font-extrabold text-slate-400">{t('Đang tải khóa học...', 'Loading course...')}</div>;
  if (!detail) return <div className="min-h-screen flex items-center justify-center font-extrabold text-rose-500">{t('Không tìm thấy khóa học.', 'Course not found.')}</div>;

  const { course, stats, user_context, modules } = detail;
  const courseImage = getFullImageUrl(course.thumbnail_url);

  const handleSubmitReview = async () => {
    if (!user_context.is_enrolled) return;
    try {
      setSavingReview(true);
      await api.student.saveCourseReview(courseId, { rating: reviewRating, comment: reviewComment });
      const [latestDetail, latestReviews] = await Promise.all([
        api.student.getCourseDetail(courseId),
        api.student.listCourseReviews(courseId, 20, 0),
      ]);
      setDetail(latestDetail);
      setReviews(latestReviews.items || []);
      setReviewComment('');
    } catch (err) {
      console.error('Failed to submit review', err);
    } finally {
      setSavingReview(false);
    }
  };

  return (
    <div className="min-h-screen bg-transparent relative">
      {showEnrollModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-3xl p-10 max-w-sm w-full text-center shadow-2xl border border-slate-100">
            <div className="w-20 h-20 bg-emerald-100 text-emerald-500 rounded-full flex items-center justify-center mx-auto mb-6">
              <CheckCircle size={40} fill="currentColor" className="text-white" />
            </div>
            <h3 className="text-2xl font-extrabold text-slate-900 mb-2">{t('Đăng ký thành công!', 'Enrolled successfully!')}</h3>
            <p className="text-sm font-bold text-slate-500 mb-8">{t('Bạn đã đăng ký khóa học', 'You have enrolled in')} <strong>{course.title}</strong>.</p>
            <button onClick={() => setShowEnrollModal(false)} className="w-full bg-slate-900 text-white py-4 rounded-xl font-extrabold text-sm uppercase tracking-widest">
              {t('Tiếp tục', 'Continue')}
            </button>
          </div>
        </div>
      )}

      <div className="bg-[#1C1D1F] text-white py-12 px-6 md:px-12">
        <div className="max-w-7xl mx-auto grid lg:grid-cols-12 gap-12">
          <div className="lg:col-span-8 space-y-6">
            <div className="flex items-center gap-2 text-sm font-bold text-primary">
              <Link href="/student/library" className="hover:underline">{t('Tổng quan', 'Dashboard')}</Link>
              <ArrowRight size={14} />
              <span className="text-white/60">{t('Khóa học', 'Course')}</span>
            </div>
            <h1 className="text-3xl md:text-4xl font-extrabold leading-tight tracking-tight">{course.title}</h1>
            <p className="text-lg text-white/80 font-medium max-w-2xl">{course.description || t(`Nội dung khóa học ${course.title}`, `${course.title} course content`)}</p>
            <div className="flex flex-wrap items-center gap-6 text-sm font-bold text-white/80">
              <div>{stats.students_enrolled} {t('học viên đã đăng ký', 'students enrolled')}</div>
              <div>{stats.total_lessons} {t('bài học', 'lessons')}</div>
              <div>{formatDuration(stats.total_duration_minutes)} {t('tổng thời lượng', 'total length')}</div>
            </div>
            <div className="flex items-center gap-4 text-sm font-bold">
              <div className="flex items-center gap-2"><UserIcon size={16} /><span>{t('Mã giảng viên', 'Instructor ID')}: <span className="text-primary underline">{course.instructor_id || 'N/A'}</span></span></div>
              <div className="flex items-center gap-2"><Globe size={16} /><span>{(course.language || 'vi').toUpperCase()}</span></div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 md:px-12 py-12 relative">
        <div className="grid lg:grid-cols-12 gap-12">
          <div className="lg:col-span-8 space-y-10">
            <div className="border-2 border-slate-100 rounded-2xl p-8 space-y-4">
              <h2 className="text-xl font-extrabold text-slate-900">{t('Tóm tắt khóa học', 'Course overview')}</h2>
              <div className="grid md:grid-cols-2 gap-4 text-sm font-bold text-slate-600">
                <div className="flex gap-3"><CheckCircle size={18} className="text-slate-400 shrink-0" />{stats.total_modules} {t('chương', 'chapters')}</div>
                <div className="flex gap-3"><CheckCircle size={18} className="text-slate-400 shrink-0" />{stats.total_lessons} {t('bài học', 'lessons')}</div>
                <div className="flex gap-3"><CheckCircle size={18} className="text-slate-400 shrink-0" />{formatDuration(stats.total_duration_minutes)} {t('thời lượng', 'duration')}</div>
                <div className="flex gap-3"><CheckCircle size={18} className="text-slate-400 shrink-0" />{t('Tiến trình', 'Progress')}: {user_context.progress_percent}%</div>
              </div>
            </div>

            <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-extrabold text-slate-900">{t('Nội dung khóa học', 'Course content')}</h2>
                <div className="text-sm font-bold text-slate-500">
                  {stats.total_lessons} {t('bài giảng', 'lectures')} • {formatDuration(stats.total_duration_minutes)} • {user_context.completed_lessons}/{stats.total_lessons} {t('đã hoàn thành', 'completed')}
                </div>
              </div>
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                {modules.map((module) => (
                  <div key={module.id} className="border-b border-slate-200 last:border-0">
                    <button
                      onClick={() => setActiveAccordion(activeAccordion === module.id ? null : module.id)}
                      aria-expanded={activeAccordion === module.id}
                      aria-controls={`module-panel-${module.id}`}
                      className="w-full flex items-center justify-between p-5 bg-slate-50 hover:bg-slate-100 transition-colors"
                    >
                      <div className="flex items-center gap-3 font-extrabold text-slate-900 text-sm">
                        <ChevronDown size={18} className={activeAccordion === module.id ? 'rotate-180 transition-transform' : 'transition-transform'} />
                        {module.title}
                      </div>
                      <div className="text-xs font-bold text-slate-500">{module.lessons.length} {t('bài học', 'lessons')}</div>
                    </button>
                    {activeAccordion === module.id && (
                      <div id={`module-panel-${module.id}`} className="divide-y divide-slate-100 bg-white">
                        {[...module.lessons].sort(naturalLessonCompare).map((lesson, idx) => (
                          <div key={lesson.id} className="p-4 flex items-center justify-between group">
                            <div className="flex items-center gap-3">
                              <MonitorPlay size={16} className="text-slate-400" />
                              <Link href={`/student/videos/${lesson.id}`} aria-label={t(`Mở bài học ${lesson.title}`, `Open lesson ${lesson.title}`)} className="text-sm font-bold text-slate-600 group-hover:text-primary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded">
                                {idx + 1}. {lesson.title}
                              </Link>
                            </div>
                            <div className="flex items-center gap-4">
                              <span className="px-2 py-0.5 bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-400 border border-slate-100 rounded">{lesson.content_type}</span>
                              <span className="text-xs font-bold text-slate-400">{lesson.duration_minutes || 0}m</span>
                              <span className="text-xs font-bold text-slate-400">
                                {lesson.is_completed ? t('đã hoàn thành', 'completed') : `${lesson.progress_percent || 0}%`}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-6 border-t border-slate-100 pt-10">
              <h2 className="text-xl font-extrabold text-slate-900">{t('Đánh giá của học viên', 'Student feedback')}</h2>
              <div className="bg-slate-50 border border-slate-100 rounded-2xl p-6">
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <div className="flex items-center gap-4">
                    <div className="text-4xl font-extrabold text-primary">{stats.rating_avg.toFixed(1)}</div>
                    <div>
                      <div className="flex text-amber-400">
                        {[1, 2, 3, 4, 5].map((i) => (
                          <Star key={i} size={16} fill={i <= Math.round(stats.rating_avg) ? 'currentColor' : 'none'} className={i <= Math.round(stats.rating_avg) ? '' : 'text-slate-300'} />
                        ))}
                      </div>
                      <div className="text-xs font-bold text-slate-500">{stats.rating_count} {t('đánh giá', 'reviews')}</div>
                    </div>
                  </div>
                  <div className="text-sm font-bold text-slate-500">{t('Đã đăng ký mới được đánh giá', 'Enroll to leave a review')}</div>
                </div>
                <div className="mt-4 space-y-2">
                  {[5, 4, 3, 2, 1].map((star) => {
                    const count = stats.rating_distribution?.[star] || 0;
                    const percent = stats.rating_count > 0 ? Math.round((count / stats.rating_count) * 100) : 0;
                    return (
                      <div key={star} className="flex items-center gap-3">
                        <div className="w-10 text-xs font-extrabold text-slate-500">{star}★</div>
                        <div className="flex-1 h-2 bg-white rounded-full overflow-hidden border border-slate-200">
                          <div className="h-full bg-primary" style={{ width: `${percent}%` }} />
                        </div>
                        <div className="w-14 text-xs font-bold text-slate-400 text-right">{percent}%</div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {user_context.is_enrolled && (
                <div className="border border-slate-100 rounded-2xl p-6 space-y-4">
                  <h3 className="text-sm font-extrabold text-slate-900 uppercase tracking-wider">{t('Gửi đánh giá của bạn', 'Leave your review')}</h3>
                  <div className="flex items-center gap-2">
                    {[1, 2, 3, 4, 5].map((s) => (
                      <button key={s} type="button" aria-label={t(`Chọn ${s} sao`, `Choose ${s} stars`)} onClick={() => setReviewRating(s)} className="text-amber-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 rounded">
                        <Star size={20} fill={s <= reviewRating ? 'currentColor' : 'none'} className={s <= reviewRating ? '' : 'text-slate-300'} />
                      </button>
                    ))}
                  </div>
                  <textarea
                    value={reviewComment}
                    onChange={(e) => setReviewComment(e.target.value)}
                    maxLength={2000}
                    placeholder={t('Nhận xét của bạn về khóa học...', 'Share your thoughts about the course...')}
                    className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm font-medium text-slate-700 min-h-24"
                  />
                  <button
                    onClick={handleSubmitReview}
                    disabled={savingReview}
                    className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-slate-900 text-white text-xs font-extrabold uppercase tracking-wider disabled:opacity-60"
                  >
                    <MessageSquare size={14} />
                    {savingReview ? t('Đang gửi...', 'Submitting...') : t('Gửi đánh giá', 'Submit review')}
                  </button>
                </div>
              )}

              <div className="space-y-4">
                {reviews.length === 0 ? (
                  <div className="text-sm font-bold text-slate-500">{t('Chưa có đánh giá nào.', 'No reviews yet.')}</div>
                ) : (
                  reviews.map((review) => (
                    <div key={review.id} className="border-b border-slate-100 pb-4 last:border-0">
                      <div className="flex items-center justify-between">
                        <div className="text-sm font-extrabold text-slate-900">{review.user_name}</div>
                        <div className="text-xs font-bold text-slate-400">{new Date(review.updated_at).toLocaleDateString(localeCode(locale))}</div>
                      </div>
                      <div className="flex items-center gap-1 text-amber-400 my-1">
                        {[1, 2, 3, 4, 5].map((i) => (
                          <Star key={i} size={13} fill={i <= review.rating ? 'currentColor' : 'none'} className={i <= review.rating ? '' : 'text-slate-300'} />
                        ))}
                      </div>
                      <p className="text-sm font-medium text-slate-600 whitespace-pre-wrap">{review.comment || t('Không có nhận xét.', 'No comment provided.')}</p>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          <div className="lg:col-span-4">
            <div className="lg:sticky lg:top-8 bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden">
              <div className="relative aspect-video group cursor-pointer">
                <CourseThumbnail src={courseImage} alt={course.title} />
                <div className="absolute inset-0 bg-slate-900/40 flex items-center justify-center">
                  <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center text-slate-900"><Play size={24} fill="currentColor" /></div>
                </div>
              </div>

              <div className="p-8 space-y-6">
                {cta.enrolled ? (
                  cta.href ? (
                    <Link href={cta.href} aria-label={cta.label} className="block w-full py-4 rounded-xl bg-emerald-500 text-white font-extrabold text-sm text-center uppercase tracking-widest focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-emerald-300">
                      {cta.label}
                    </Link>
                  ) : (
                    <div className="block w-full py-4 rounded-xl bg-slate-200 text-slate-500 font-extrabold text-sm text-center uppercase tracking-widest">
                      {t('Chưa có bài học', 'No lessons yet')}
                    </div>
                  )
                ) : (
                  <button onClick={handleEnroll} aria-label={t('Đăng ký khóa học', 'Enroll in course')} className="block w-full py-4 rounded-xl bg-slate-900 text-white font-extrabold text-sm text-center uppercase tracking-widest focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-slate-300">
                    {t('Đăng ký ngay', 'Enroll now')}
                  </button>
                )}

                <div className="space-y-4">
                  <h4 className="text-sm font-extrabold text-slate-900">{t('Khóa học này bao gồm:', 'This course includes:')}</h4>
                  <div className="space-y-3">
                    <div className="flex items-center gap-3 text-xs font-bold text-slate-600"><MonitorPlay size={16} className="text-slate-400" />{stats.total_lessons} {t('bài học theo yêu cầu', 'on-demand lessons')}</div>
                    <div className="flex items-center gap-3 text-xs font-bold text-slate-600"><Clock size={16} className="text-slate-400" />{t('Truy cập không giới hạn', 'Full lifetime access')}</div>
                    <div className="flex items-center gap-3 text-xs font-bold text-slate-600"><Globe size={16} className="text-slate-400" />{t('Ngôn ngữ', 'Language')}: {(course.language || 'vi').toUpperCase()}</div>
                    <div className="flex items-center gap-3 text-xs font-bold text-slate-600"><CheckCircle size={16} className="text-slate-400" />{t('Đã bật theo dõi tiến trình', 'Progress tracking enabled')}</div>
                  </div>
                </div>

                <div className="pt-6 border-t border-slate-100 space-y-4">
                  <h4 className="text-sm font-extrabold text-slate-900">{t('Thông tin khóa học:', 'Course details:')}</h4>
                  <div className="space-y-3">
                    <div className="flex items-center gap-3 text-xs font-bold text-slate-500"><Users size={16} className="text-primary" />{t('Đã đăng ký', 'Enrolled')}: {stats.students_enrolled}</div>
                    <div className="flex items-center gap-3 text-xs font-bold text-slate-500"><Clock size={16} className="text-primary" />{t('Thời lượng', 'Duration')}: {formatDuration(stats.total_duration_minutes)}</div>
                    <div className="flex items-center gap-3 text-xs font-bold text-slate-500"><Layers size={16} className="text-primary" />{t('Chương', 'Chapters')}: {stats.total_modules}</div>
                    <div className="flex items-center gap-3 text-xs font-bold text-slate-500"><Play size={16} className="text-primary" />{t('Đã hoàn thành', 'Completed')}: {user_context.completed_lessons}/{stats.total_lessons}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
