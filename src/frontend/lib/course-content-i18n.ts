import type { Locale } from '@/store/useAppStore';

const VI_PERSONAL_COURSE_PREFIX = 'Khóa học cá nhân của ';
const EN_PERSONAL_COURSE_PREFIX = 'Personal course for ';

const ENROLLMENT_STATUS_LABELS: Record<string, readonly [vi: string, en: string]> = {
  active: ['Đang học', 'Active'],
  completed: ['Hoàn thành', 'Completed'],
  cancelled: ['Đã hủy', 'Cancelled'],
};

export function localizeCourseTitle(value: string, locale: Locale): string {
  const title = value.trim();
  if (!title) return value;

  if (locale === 'en') {
    if (title.startsWith(VI_PERSONAL_COURSE_PREFIX)) {
      return `${EN_PERSONAL_COURSE_PREFIX}${title.slice(VI_PERSONAL_COURSE_PREFIX.length)}`;
    }
    if (title === 'Khóa học cá nhân' || title === 'Tu hoc ca nhan') return 'Personal course';
  }

  if (locale === 'vi') {
    if (title.startsWith(EN_PERSONAL_COURSE_PREFIX)) {
      return `${VI_PERSONAL_COURSE_PREFIX}${title.slice(EN_PERSONAL_COURSE_PREFIX.length)}`;
    }
    if (title === 'Personal course' || title === 'Tu hoc ca nhan') return 'Khóa học cá nhân';
  }

  return value;
}

export function localizeEnrollmentStatus(value: string, locale: Locale): string {
  const labels = ENROLLMENT_STATUS_LABELS[value.trim().toLowerCase()];
  if (!labels) return value;
  return locale === 'en' ? labels[1] : labels[0];
}
