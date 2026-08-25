'use client';

import { Bell, LogOut, Menu, User } from 'lucide-react';
import { useRouter } from 'next/navigation';
import React from 'react';

import { Brand } from '@/components/Brand';
import { LanguageToggle } from '@/components/LanguageToggle';
import { ThemeToggle } from '@/components/ThemeToggle';
import { IconButton } from '@/components/ui/IconButton';
import { api } from '@/lib/api';
import { localeCode, useI18n } from '@/lib/i18n';
import { useAppStore } from '@/store/useAppStore';

type Notification = { id: string; message: string; created_at: string; read: boolean };

export function TopBar({
  showNavigation,
  onOpenNavigation,
}: {
  showNavigation: boolean;
  onOpenNavigation: () => void;
}) {
  const { user, logout } = useAppStore();
  const { locale, t } = useI18n();
  const router = useRouter();
  const [openMenu, setOpenMenu] = React.useState<'notifications' | 'profile' | null>(null);
  const [notifications, setNotifications] = React.useState<Notification[]>([]);
  const actionsRef = React.useRef<HTMLDivElement>(null);

  const loadNotifications = React.useCallback(() => {
    if (typeof window === 'undefined') return;
    const data = JSON.parse(window.localStorage.getItem('app_notifications') || '[]');
    setNotifications(Array.isArray(data) ? data : []);
  }, []);

  React.useEffect(() => {
    loadNotifications();
    const handler = () => loadNotifications();
    window.addEventListener('app-notification-updated', handler);
    return () => window.removeEventListener('app-notification-updated', handler);
  }, [loadNotifications]);

  React.useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (!actionsRef.current?.contains(event.target as Node)) setOpenMenu(null);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpenMenu(null);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  const handleLogout = async () => {
    try {
      await api.auth.logout();
    } catch {
      // Local state still clears if the backend is unavailable.
    } finally {
      logout();
      router.push('/auth/login');
    }
  };

  const unreadCount = notifications.filter((item) => !item.read).length;
  const roleLabel = user?.role === 'admin'
    ? t('Quản trị viên', 'Admin')
    : user?.role === 'teacher'
      ? t('Giảng viên', 'Teacher')
      : user?.role === 'student'
        ? t('Học viên', 'Student')
        : t('Khách', 'Guest');
  const toggleNotifications = () => {
    const nextOpen = openMenu !== 'notifications';
    setOpenMenu(nextOpen ? 'notifications' : null);
    if (nextOpen && typeof window !== 'undefined') {
      const next = notifications.map((item) => ({ ...item, read: true }));
      window.localStorage.setItem('app_notifications', JSON.stringify(next));
      setNotifications(next);
    }
  };

  return (
    <header className="fixed inset-x-0 top-0 z-50 h-16 border-b border-[var(--lb-border)] bg-[var(--lb-surface)]">
      <div className="mx-auto flex h-full items-center justify-between gap-3 px-3 sm:px-5">
        <div className="flex min-w-0 items-center gap-2">
          {showNavigation && (
            <IconButton label={t('Mở điều hướng', 'Open navigation')} onClick={onOpenNavigation} className="lg:hidden">
              <Menu size={20} />
            </IconButton>
          )}
          <Brand wordmarkClassName="hidden sm:inline" />
        </div>

        <div ref={actionsRef} className="relative flex items-center gap-1">
          <LanguageToggle />
          <ThemeToggle />
          <div className="relative">
            <IconButton
              label={unreadCount > 0
                ? t(`Thông báo, ${unreadCount} chưa đọc`, `${unreadCount} unread notifications`)
                : t('Thông báo', 'Notifications')}
              aria-expanded={openMenu === 'notifications'}
              aria-haspopup="menu"
              onClick={toggleNotifications}
            >
              <Bell size={19} />
              {unreadCount > 0 && (
                <span className="absolute right-2 top-2 min-w-4 rounded-full bg-[var(--lb-danger)] px-1 text-center text-[10px] font-bold leading-4 text-white" aria-hidden="true">
                  {Math.min(unreadCount, 9)}
                </span>
              )}
            </IconButton>
            {openMenu === 'notifications' && (
              <div role="menu" className="absolute right-0 mt-2 w-[min(22rem,calc(100vw-1.5rem))] rounded-[10px] border border-[var(--lb-border)] bg-[var(--lb-elevated)] p-3 shadow-[var(--lb-shadow-popover)]">
                <p className="px-1 pb-2 text-xs font-bold tracking-[0.08em] text-[var(--lb-subtle)]">{t('Thông báo', 'Notifications')}</p>
                <div className="max-h-72 space-y-2 overflow-y-auto">
                  {notifications.length === 0 ? (
                    <p className="rounded-md bg-[var(--lb-accent-soft)] px-3 py-4 text-sm text-[var(--lb-muted)]">{t('Chưa có thông báo.', 'No notifications yet.')}</p>
                  ) : notifications.map((item) => (
                    <div key={item.id} role="menuitem" tabIndex={0} className="rounded-md border border-[var(--lb-border)] px-3 py-2.5">
                      <p className="text-sm font-semibold text-[var(--lb-ink)]">{item.message}</p>
                      <p className="mt-1 text-xs text-[var(--lb-muted)]">{new Date(item.created_at).toLocaleString(localeCode(locale))}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="relative">
            <button
              type="button"
              className="flex min-h-11 items-center gap-2 rounded-md px-2 text-left transition-colors hover:bg-[var(--lb-accent-soft)]"
              aria-expanded={openMenu === 'profile'}
              aria-haspopup="menu"
              onClick={() => setOpenMenu(openMenu === 'profile' ? null : 'profile')}
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-md bg-[var(--lb-accent-soft)] text-[var(--lb-accent)]"><User size={17} /></span>
              <span className="hidden max-w-40 sm:block">
                <span className="block truncate text-sm font-semibold text-[var(--lb-ink)]">{user?.name || t('Khách', 'Guest')}</span>
                <span className="block truncate text-xs text-[var(--lb-muted)]">{roleLabel}</span>
              </span>
            </button>
            {openMenu === 'profile' && (
              <div role="menu" className="absolute right-0 mt-2 w-48 rounded-[10px] border border-[var(--lb-border)] bg-[var(--lb-elevated)] p-2 shadow-[var(--lb-shadow-popover)]">
                <button type="button" role="menuitem" onClick={handleLogout} className="flex min-h-11 w-full items-center gap-2 rounded-md px-3 text-sm font-semibold text-[var(--lb-muted)] hover:bg-[var(--lb-danger-soft)] hover:text-[var(--lb-danger)]">
                  <LogOut size={17} /> {t('Đăng xuất', 'Sign out')}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
