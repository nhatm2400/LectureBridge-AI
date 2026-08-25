'use client';

import {
  Award,
  BookOpen,
  Check,
  Clock,
  Eye,
  LayoutDashboard,
  Moon,
  Pencil,
  ScrollText,
  Settings as SettingsIcon,
  Sun,
  User,
} from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import React, { Suspense } from 'react';

import { Button, buttonClassName } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { IconButton } from '@/components/ui/IconButton';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatePanel } from '@/components/ui/StatePanel';
import { Surface } from '@/components/ui/Surface';
import { api, type StudentProfileData } from '@/lib/api';
import { localeCode, type Translate, useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/useAppStore';

type SettingsTab = 'dashboard' | 'profile' | 'accessibility';

const getSettingsTabs = (t: Translate): Array<{
  id: SettingsTab;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
}> => [
  { id: 'dashboard', label: t('Tổng quan', 'Overview'), icon: LayoutDashboard },
  { id: 'profile', label: t('Hồ sơ', 'Profile'), icon: User },
  { id: 'accessibility', label: t('Trợ năng', 'Accessibility'), icon: SettingsIcon },
];

function PreferenceSwitch({
  checked,
  description,
  icon: Icon,
  label,
  onChange,
}: {
  checked: boolean;
  description: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  onChange: () => void;
}) {
  return (
    <div className="flex items-start justify-between gap-5 border-t border-[var(--lb-border)] py-5 first:border-t-0 first:pt-0 last:pb-0">
      <div className="flex min-w-0 gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-[var(--lb-accent-soft)] text-[var(--lb-accent)]" aria-hidden="true">
          <Icon size={19} />
        </span>
        <div>
          <p className="text-sm font-semibold text-[var(--lb-ink)]">{label}</p>
          <p className="mt-1 max-w-xl text-sm leading-6 text-[var(--lb-muted)]">{description}</p>
        </div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={onChange}
        className="flex h-11 w-14 shrink-0 items-center justify-center rounded-md"
      >
        <span className={cn(
          'relative h-6 w-11 rounded-full transition-colors duration-150',
          checked ? 'bg-[var(--lb-accent)]' : 'bg-[var(--lb-border-strong)]',
        )}>
          <span className={cn(
            'absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-[var(--lb-elevated)] transition-transform duration-150',
            checked ? 'translate-x-5' : 'translate-x-0',
          )} />
        </span>
      </button>
    </div>
  );
}

function SettingsPageContent() {
  const { locale, t } = useI18n();
  const settingsTabs = getSettingsTabs(t);
  const searchParams = useSearchParams();
  const requestedTab = searchParams.get('tab');
  const activeTab: SettingsTab = settingsTabs.some((tab) => tab.id === requestedTab)
    ? requestedTab as SettingsTab
    : 'dashboard';

  const [profileData, setProfileData] = React.useState<StudentProfileData | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState('');
  const [saveError, setSaveError] = React.useState('');
  const [isEditingProfile, setIsEditingProfile] = React.useState(false);
  const [isSaving, setIsSaving] = React.useState(false);
  const [editedName, setEditedName] = React.useState('');
  const [editedBio, setEditedBio] = React.useState('');
  const [editedGoals, setEditedGoals] = React.useState('');

  const {
    autoScroll,
    highContrast,
    setAutoScroll,
    setHighContrast,
    setTheme,
    theme,
    user,
  } = useAppStore();

  const loadProfile = React.useCallback(async () => {
    setIsLoading(true);
    setLoadError('');
    try {
      const data = await api.student.getProfile();
      setProfileData(data);
      setEditedBio(data.profile.bio || '');
      setEditedGoals(data.profile.learning_goals || '');
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : t('Không thể tải hồ sơ học tập.', 'Could not load your learning profile.'));
    } finally {
      setIsLoading(false);
    }
  }, [t]);

  React.useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  React.useEffect(() => {
    if (user?.name) setEditedName(user.name);
  }, [user?.name]);

  const cancelEditing = () => {
    setEditedName(user?.name || '');
    setEditedBio(profileData?.profile.bio || '');
    setEditedGoals(profileData?.profile.learning_goals || '');
    setSaveError('');
    setIsEditingProfile(false);
  };

  const handleSaveProfile = async () => {
    if (!editedName.trim()) return;
    setIsSaving(true);
    setSaveError('');
    try {
      await api.student.updateProfile({
        bio: editedBio.trim(),
        learning_goals: editedGoals.trim(),
        full_name: editedName.trim(),
      } as Parameters<typeof api.student.updateProfile>[0]);

      if (user) {
        useAppStore.getState().login({ ...user, name: editedName.trim() });
      }

      setProfileData((current) => current ? {
        ...current,
        profile: {
          ...current.profile,
          bio: editedBio.trim(),
          learning_goals: editedGoals.trim(),
        },
      } : current);
      setIsEditingProfile(false);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : t('Không thể lưu thay đổi.', 'Could not save changes.'));
    } finally {
      setIsSaving(false);
    }
  };

  const renderProfileState = () => {
    if (isLoading) {
      return <StatePanel state="loading" title={t('Đang tải hồ sơ', 'Loading profile')} description={t('LectureBridge đang lấy tiến độ và thiết lập của bạn.', 'LectureBridge is retrieving your progress and settings.')} />;
    }
    if (loadError) {
      return (
        <StatePanel
          state="error"
          title={t('Không thể tải hồ sơ', 'Could not load profile')}
          description={loadError}
          action={<Button variant="secondary" onClick={() => void loadProfile()}>{t('Thử lại', 'Try again')}</Button>}
        />
      );
    }
    if (!profileData) {
      return <StatePanel state="empty" title={t('Chưa có dữ liệu hồ sơ', 'No profile data yet')} description={t('Hãy thử tải lại trang sau ít phút.', 'Try reloading the page in a few minutes.')} />;
    }
    return null;
  };

  const profileState = activeTab !== 'accessibility' ? renderProfileState() : null;

  return (
    <div className="bg-transparent">
      <div className="mx-auto w-full max-w-6xl space-y-6 px-5 py-8 sm:px-8 lg:px-10 lg:py-10">
        <PageHeader
          eyebrow={t('Tài khoản', 'Account')}
          title={t('Cài đặt và hồ sơ', 'Settings and profile')}
          description={t('Theo dõi hoạt động học tập, cập nhật thông tin cá nhân và điều chỉnh trải nghiệm theo nhu cầu của bạn.', 'Review learning activity, update personal information, and tailor the experience to your needs.')}
        />

        <nav aria-label={t('Các mục cài đặt', 'Settings sections')} className="rounded-[10px] border border-[var(--lb-border)] bg-[var(--lb-surface)] p-1">
          <div className="grid grid-cols-3 gap-1">
            {settingsTabs.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <Link
                  key={tab.id}
                  href={`/student/settings?tab=${tab.id}`}
                  aria-current={isActive ? 'page' : undefined}
                  className={cn(
                    'flex min-h-11 min-w-0 items-center justify-center gap-2 rounded-md px-2 text-xs font-semibold transition-colors duration-150 sm:px-4 sm:text-sm',
                    isActive
                      ? 'bg-[var(--lb-accent-soft)] text-[var(--lb-ink)]'
                      : 'text-[var(--lb-muted)] hover:bg-[var(--lb-elevated)] hover:text-[var(--lb-ink)]',
                  )}
                >
                  <tab.icon size={17} className={isActive ? 'text-[var(--lb-accent)]' : 'text-[var(--lb-subtle)]'} aria-hidden="true" />
                  <span className="truncate">{tab.label}</span>
                </Link>
              );
            })}
          </div>
        </nav>

        {profileState}

        {!profileState && activeTab === 'dashboard' && profileData && (
          <div className="space-y-6">
            <section aria-labelledby="learning-overview-heading">
              <div className="mb-4">
                <h2 id="learning-overview-heading" className="text-xl">{t('Hoạt động học tập', 'Learning activity')}</h2>
                <p className="mt-1 text-sm leading-6 text-[var(--lb-muted)]">{t('Một góc nhìn ngắn về tiến độ hiện tại của bạn.', 'A quick view of your current progress.')}</p>
              </div>
              <Surface className="overflow-hidden">
                <dl className="grid grid-cols-2 gap-px bg-[var(--lb-border)] md:grid-cols-4">
                  {[
                    { label: t('Đã đăng ký', 'Enrolled'), value: profileData.stats.total_enrollments, icon: BookOpen },
                    { label: t('Hoàn thành', 'Completed'), value: profileData.stats.completed_lessons, icon: Check },
                    { label: t('Giờ học', 'Learning hours'), value: `${profileData.stats.total_hours}h`, icon: Clock },
                    { label: t('Chứng chỉ', 'Certificates'), value: profileData.stats.certificates_count, icon: Award },
                  ].map((stat) => (
                    <div key={stat.label} className="bg-[var(--lb-surface)] p-5 sm:p-6">
                      <dt className="flex items-center gap-2 text-sm font-semibold text-[var(--lb-muted)]">
                        <stat.icon size={17} className="text-[var(--lb-accent)]" aria-hidden="true" />
                        {stat.label}
                      </dt>
                      <dd className="mt-3 text-[1.75rem] font-bold leading-none tabular-nums text-[var(--lb-ink)]">{stat.value}</dd>
                    </div>
                  ))}
                </dl>
              </Surface>
            </section>

            <Surface className="overflow-hidden" aria-labelledby="certificates-heading">
              <div className="flex flex-col gap-2 border-b border-[var(--lb-border)] p-5 sm:flex-row sm:items-end sm:justify-between sm:p-6">
                <div>
                  <h2 id="certificates-heading" className="text-xl">{t('Chứng chỉ của tôi', 'My certificates')}</h2>
                  <p className="mt-1 text-sm leading-6 text-[var(--lb-muted)]">{t('Các chứng chỉ được cấp sau khi hoàn thành khóa học.', 'Certificates are issued after course completion.')}</p>
                </div>
                <span className="text-sm font-semibold tabular-nums text-[var(--lb-muted)]">{profileData.profile.certifications?.length || 0} {t('chứng chỉ', 'certificates')}</span>
              </div>

              {profileData.profile.certifications && profileData.profile.certifications.length > 0 ? (
                <ul className="divide-y divide-[var(--lb-border)] px-5 sm:px-6">
                  {profileData.profile.certifications.map((cert) => (
                    <li key={cert.cert_id} className="flex flex-col gap-4 py-5 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex min-w-0 items-start gap-3">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-[var(--lb-accent-soft)] text-[var(--lb-accent)]" aria-hidden="true">
                          <Award size={19} />
                        </span>
                        <div className="min-w-0">
                          <h3 className="truncate text-base">{cert.course_title}</h3>
                          <p className="mt-1 text-xs leading-5 text-[var(--lb-muted)]">ID: {cert.cert_id} · {t('Cấp ngày', 'Issued')} {new Date(cert.issue_date).toLocaleDateString(localeCode(locale))}</p>
                        </div>
                      </div>
                      <Button variant="secondary" size="sm">{t('Tải xuống', 'Download')}</Button>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="px-5 py-8 text-center sm:px-6 sm:py-10">
                  <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-md bg-[var(--lb-accent-soft)] text-[var(--lb-accent)]" aria-hidden="true">
                    <Award size={21} />
                  </span>
                  <h3 className="mt-4 text-lg">{t('Chưa có chứng chỉ', 'No certificates yet')}</h3>
                  <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[var(--lb-muted)]">{t('Hoàn thành khóa học đang theo học để chứng chỉ đầu tiên xuất hiện tại đây.', 'Complete an enrolled course and your first certificate will appear here.')}</p>
                  <Link href="/student/documents" className={buttonClassName({ variant: 'secondary', size: 'sm', className: 'mt-5' })}>
                    {t('Xem khóa học đã đăng ký', 'View enrolled courses')}
                  </Link>
                </div>
              )}
            </Surface>
          </div>
        )}

        {!profileState && activeTab === 'profile' && profileData && (
          <Surface className="overflow-hidden" aria-labelledby="profile-heading">
            <div className="flex items-center justify-between gap-4 border-b border-[var(--lb-border)] p-5 sm:p-6">
              <div>
                <h2 id="profile-heading" className="text-xl">{t('Thông tin cá nhân', 'Personal information')}</h2>
                <p className="mt-1 text-sm leading-6 text-[var(--lb-muted)]">{t('Thông tin được hiển thị trong không gian học tập của bạn.', 'Information displayed in your learning workspace.')}</p>
              </div>
              {!isEditingProfile && (
                <IconButton label={t('Chỉnh sửa hồ sơ', 'Edit profile')} onClick={() => setIsEditingProfile(true)} className="border-[var(--lb-border)] bg-[var(--lb-elevated)]">
                  <Pencil size={17} aria-hidden="true" />
                </IconButton>
              )}
            </div>

            <form
              className="space-y-6 p-5 sm:p-6"
              onSubmit={(event) => {
                event.preventDefault();
                void handleSaveProfile();
              }}
            >
              <div className="grid gap-6 md:grid-cols-2">
                {isEditingProfile ? (
                  <Field label={t('Tên hiển thị', 'Display name')} htmlFor="profile-display-name">
                    <input
                      id="profile-display-name"
                      value={editedName}
                      onChange={(event) => setEditedName(event.target.value)}
                      className="lb-field"
                      placeholder={t('Nhập tên hiển thị', 'Enter a display name')}
                      autoComplete="name"
                      autoFocus
                    />
                  </Field>
                ) : (
                  <div className="space-y-2">
                    <p className="text-sm font-semibold text-[var(--lb-ink)]">{t('Tên hiển thị', 'Display name')}</p>
                    <p id="profile-display-name" className="min-h-11 border-b border-[var(--lb-border)] py-3 text-sm font-semibold text-[var(--lb-ink)]">{user?.name || t('Chưa cập nhật', 'Not updated')}</p>
                  </div>
                )}
                <div className="space-y-2">
                  <p className="text-sm font-semibold text-[var(--lb-ink)]">{t('Địa chỉ email', 'Email address')}</p>
                  <p id="profile-email" className="min-h-11 border-b border-[var(--lb-border)] py-3 text-sm font-semibold text-[var(--lb-ink)]">{user?.email || t('Chưa cập nhật', 'Not updated')}</p>
                </div>
              </div>

              {isEditingProfile ? (
                <Field label={t('Giới thiệu', 'About')} htmlFor="profile-bio">
                  <textarea id="profile-bio" value={editedBio} onChange={(event) => setEditedBio(event.target.value)} rows={4} className="lb-field resize-y" placeholder={t('Chia sẻ ngắn về bản thân bạn', 'Share a short introduction')} />
                </Field>
              ) : (
                <div className="space-y-2">
                  <p className="text-sm font-semibold text-[var(--lb-ink)]">{t('Giới thiệu', 'About')}</p>
                  <p id="profile-bio" className="min-h-20 rounded-md border border-[var(--lb-border)] bg-[var(--lb-elevated)] p-4 text-sm leading-6 text-[var(--lb-muted)]">{profileData.profile.bio || t('Bạn chưa thêm thông tin giới thiệu.', 'You have not added an introduction yet.')}</p>
                </div>
              )}

              {isEditingProfile ? (
                <Field label={t('Mục tiêu học tập', 'Learning goals')} htmlFor="profile-goals">
                  <textarea id="profile-goals" value={editedGoals} onChange={(event) => setEditedGoals(event.target.value)} rows={4} className="lb-field resize-y" placeholder={t('Bạn muốn đạt được điều gì trong quá trình học?', 'What would you like to achieve while learning?')} />
                </Field>
              ) : (
                <div className="space-y-2">
                  <p className="text-sm font-semibold text-[var(--lb-ink)]">{t('Mục tiêu học tập', 'Learning goals')}</p>
                  <p id="profile-goals" className="min-h-20 rounded-md border border-[var(--lb-border)] bg-[var(--lb-elevated)] p-4 text-sm leading-6 text-[var(--lb-muted)]">{profileData.profile.learning_goals || t('Bạn chưa đặt mục tiêu học tập.', 'You have not set learning goals yet.')}</p>
                </div>
              )}

              {saveError && <p role="alert" className="rounded-md border border-[var(--lb-danger)] bg-[var(--lb-danger-soft)] p-3 text-sm font-semibold text-[var(--lb-danger)]">{saveError}</p>}

              {isEditingProfile && (
                <div className="flex flex-col-reverse gap-3 border-t border-[var(--lb-border)] pt-5 sm:flex-row sm:justify-end">
                  <Button type="button" variant="ghost" onClick={cancelEditing}>{t('Hủy', 'Cancel')}</Button>
                  <Button type="submit" disabled={isSaving || !editedName.trim()}>{isSaving ? t('Đang lưu…', 'Saving…') : t('Lưu thay đổi', 'Save changes')}</Button>
                </div>
              )}
            </form>
          </Surface>
        )}

        {activeTab === 'accessibility' && (
          <Surface className="overflow-hidden" aria-labelledby="accessibility-heading">
            <div className="border-b border-[var(--lb-border)] p-5 sm:p-6">
              <h2 id="accessibility-heading" className="text-xl">{t('Cấu hình trợ năng', 'Accessibility settings')}</h2>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-[var(--lb-muted)]">{t('Điều chỉnh cách LectureBridge hiển thị nội dung và đồng bộ transcript trong quá trình học.', 'Adjust how LectureBridge displays content and follows the transcript while you learn.')}</p>
            </div>

            <div className="space-y-7 p-5 sm:p-6">
              <section aria-labelledby="appearance-heading">
                <h3 id="appearance-heading" className="text-base">{t('Giao diện hiển thị', 'Appearance')}</h3>
                <p className="mt-1 text-sm leading-6 text-[var(--lb-muted)]">{t('Chọn chế độ phù hợp với môi trường học hiện tại.', 'Choose the mode that fits your current learning environment.')}</p>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <button
                    type="button"
                    aria-pressed={theme === 'light'}
                    onClick={() => setTheme('light')}
                    className={cn(
                      'flex min-h-20 items-start gap-3 rounded-md border p-4 text-left transition-colors duration-150',
                      theme === 'light'
                        ? 'border-[var(--lb-accent)] bg-[var(--lb-accent-soft)]'
                        : 'border-[var(--lb-border)] bg-[var(--lb-elevated)] hover:border-[var(--lb-border-strong)]',
                    )}
                  >
                    <Sun size={20} className="mt-0.5 shrink-0 text-[var(--lb-accent)]" aria-hidden="true" />
                    <span>
                      <span className="block text-sm font-semibold text-[var(--lb-ink)]">{t('Chế độ sáng', 'Light mode')}</span>
                      <span className="mt-1 block text-xs leading-5 text-[var(--lb-muted)]">{t('Nền giấy sáng cho môi trường đủ ánh sáng.', 'A light paper surface for well-lit spaces.')}</span>
                    </span>
                  </button>
                  <button
                    type="button"
                    aria-pressed={theme === 'dark'}
                    onClick={() => setTheme('dark')}
                    className={cn(
                      'flex min-h-20 items-start gap-3 rounded-md border p-4 text-left transition-colors duration-150',
                      theme === 'dark'
                        ? 'border-[var(--lb-accent)] bg-[var(--lb-accent-soft)]'
                        : 'border-[var(--lb-border)] bg-[var(--lb-elevated)] hover:border-[var(--lb-border-strong)]',
                    )}
                  >
                    <Moon size={20} className="mt-0.5 shrink-0 text-[var(--lb-accent)]" aria-hidden="true" />
                    <span>
                      <span className="block text-sm font-semibold text-[var(--lb-ink)]">{t('Chế độ tối', 'Dark mode')}</span>
                      <span className="mt-1 block text-xs leading-5 text-[var(--lb-muted)]">{t('Giảm độ sáng trong không gian học tối.', 'Reduce brightness in darker learning spaces.')}</span>
                    </span>
                  </button>
                </div>
              </section>

              <section className="border-t border-[var(--lb-border)] pt-6" aria-labelledby="reading-heading">
                <h3 id="reading-heading" className="text-base">{t('Đọc và theo dõi nội dung', 'Reading and content tracking')}</h3>
                <div className="mt-4">
                  <PreferenceSwitch
                    checked={highContrast}
                    onChange={() => setHighContrast(!highContrast)}
                    icon={Eye}
                    label={t('Độ tương phản cao', 'High contrast')}
                    description={t('Làm rõ ranh giới và trạng thái của các thành phần quan trọng.', 'Clarify boundaries and states for important interface elements.')}
                  />
                  <PreferenceSwitch
                    checked={autoScroll}
                    onChange={() => setAutoScroll(!autoScroll)}
                    icon={ScrollText}
                    label={t('Tự động cuộn phụ đề', 'Auto-scroll transcript')}
                    description={t('Giữ đoạn transcript đang phát trong vùng nhìn thấy khi video tiếp tục.', 'Keep the active transcript segment visible as the video continues.')}
                  />
                </div>
              </section>
            </div>
          </Surface>
        )}
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const { t } = useI18n();
  return (
    <Suspense
      fallback={(
        <div className="mx-auto w-full max-w-6xl px-5 py-8 sm:px-8 lg:px-10 lg:py-10">
          <StatePanel state="loading" title={t('Đang mở cài đặt', 'Opening settings')} />
        </div>
      )}
    >
      <SettingsPageContent />
    </Suspense>
  );
}
