'use client';

import React from 'react';
import { Bell, LogOut, Moon, Sun, User } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useAppStore } from '@/store/useAppStore';

export function TopBar() {
  const { theme, setTheme, user, logout } = useAppStore();
  const [mounted, setMounted] = React.useState(false);
  const router = useRouter();
  const [notifOpen, setNotifOpen] = React.useState(false);
  const [notifications, setNotifications] = React.useState<
    Array<{ id: string; message: string; created_at: string; read: boolean }>
  >([]);

  React.useEffect(() => {
    setMounted(true);
  }, []);

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

  const handleLogout = async () => {
    try {
      await api.auth.logout();
    } catch {
      // Clear local session state even if the backend is unreachable.
    } finally {
      logout();
      router.push('/auth/login');
    }
  };

  const unreadCount = notifications.filter((item) => !item.read).length;

  const markAllRead = () => {
    if (typeof window === 'undefined') return;
    const next = notifications.map((item) => ({ ...item, read: true }));
    window.localStorage.setItem('app_notifications', JSON.stringify(next));
    setNotifications(next);
  };

  return (
    <header className="fixed left-0 right-0 top-0 z-50 border-b border-[var(--app-border-subtle)] bg-[var(--app-surface)] shadow-sm">
      <div className="relative z-50 flex h-20 items-center justify-end border-b border-[var(--app-border-subtle)] bg-[var(--app-surface)] px-8">
        <div className="flex items-center justify-end gap-6">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
              aria-label={mounted ? (theme === 'light' ? 'Chuyển sang chế độ tối' : 'Chuyển sang chế độ sáng') : ''}
              title={mounted ? (theme === 'light' ? 'Chuyển sang chế độ tối' : 'Chuyển sang chế độ sáng') : ''}
              suppressHydrationWarning
              className="rounded-full p-2.5 text-slate-500 transition-all hover:bg-slate-50 hover:text-primary"
            >
              {mounted ? (theme === 'light' ? <Moon size={20} /> : <Sun size={20} />) : <div className="h-5 w-5" />}
            </button>

            <div className="relative">
              <button
                onClick={() => {
                  const next = !notifOpen;
                  setNotifOpen(next);
                  if (next) markAllRead();
                }}
                suppressHydrationWarning
                className="relative rounded-full p-2.5 text-slate-500 transition-all hover:bg-slate-50 hover:text-primary"
                aria-label="Thông báo"
              >
                <Bell size={20} />
                {unreadCount > 0 && (
                  <span className="absolute right-2.5 top-2.5 h-2 w-2 rounded-full border-2 border-white bg-red-500" />
                )}
              </button>
              {notifOpen && (
                <div className="absolute right-0 z-50 mt-2 w-[320px] rounded-2xl border border-slate-100 bg-white p-3 shadow-xl">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-xs font-extrabold uppercase tracking-widest text-slate-400">Thông báo</p>
                    <button
                      className="text-[11px] font-bold text-slate-500 hover:text-primary"
                      onClick={markAllRead}
                      suppressHydrationWarning
                    >
                      Đánh dấu đã đọc
                    </button>
                  </div>
                  <div className="max-h-72 space-y-2 overflow-y-auto">
                    {notifications.length === 0 ? (
                      <p className="rounded-xl bg-slate-50 px-3 py-4 text-xs font-bold text-slate-400">
                        Chưa có thông báo.
                      </p>
                    ) : (
                      notifications.map((item) => (
                        <div key={item.id} className="rounded-xl border border-slate-100 px-3 py-2">
                          <p className="text-xs font-bold text-slate-700">{item.message}</p>
                          <p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                            {new Date(item.created_at).toLocaleString()}
                          </p>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="h-8 w-px bg-slate-100" />

          <div className="group relative flex cursor-pointer items-center gap-3 pl-2">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-bold text-slate-900 transition-colors group-hover:text-primary">
                {user?.name || 'Khách'}
              </p>
              <p className="text-xs font-extrabold uppercase tracking-widest text-slate-400">
                {user?.role || 'Khách'}
              </p>
            </div>

            <div className="group/profile relative">
              <div className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-full border-2 border-white bg-slate-100 shadow-sm transition-all group-hover:border-primary">
                <User className="text-slate-400" size={24} />
              </div>
              <div className="absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full border-2 border-white bg-green-500" />

              <div className="invisible absolute right-0 top-full mt-2 w-48 rounded-2xl border border-slate-100 bg-white py-2 opacity-0 shadow-xl transition-all group-hover/profile:visible group-hover/profile:opacity-100">
                <button
                  onClick={handleLogout}
                  suppressHydrationWarning
                  className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm font-bold text-slate-600 hover:bg-slate-50 hover:text-red-500"
                >
                  <LogOut size={16} />
                  Đăng xuất
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
