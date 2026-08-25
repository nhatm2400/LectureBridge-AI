'use client';

import dynamic from 'next/dynamic';
import { usePathname, useRouter } from 'next/navigation';
import React from 'react';

import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { useAppStore } from '@/store/useAppStore';
import { AppSidebar, MobileAppSidebar } from './AppSidebar';
import { TopBar } from './TopBar';

const Footer = dynamic(() => import('./Footer').then((mod) => mod.Footer), { ssr: false });

export function ClientShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { t } = useI18n();
  const router = useRouter();
  const login = useAppStore((state) => state.login);
  const logout = useAppStore((state) => state.logout);
  const [mobileNavigationOpen, setMobileNavigationOpen] = React.useState(false);
  const [sessionCheck, setSessionCheck] = React.useState({ pathname: '', authenticated: false });
  const isLandingPage = pathname === '/';
  const isAuthPage = pathname.startsWith('/auth/');
  const isPublicPage = isLandingPage || isAuthPage;
  const isAdminPage = pathname.startsWith('/admin');
  const isVideoProcessingPage = pathname.startsWith('/student/videos/') && pathname.includes('/processing');
  const showNavigation = !isVideoProcessingPage;
  const openMobileNavigation = React.useCallback(() => setMobileNavigationOpen(true), []);
  const closeMobileNavigation = React.useCallback(() => setMobileNavigationOpen(false), []);

  React.useEffect(() => setMobileNavigationOpen(false), [pathname]);

  React.useEffect(() => {
    if (isPublicPage) return;
    let cancelled = false;

    api.auth.me()
      .then((me) => {
        if (cancelled) return;
        const displayName = (me.full_name || '').trim() || me.email.split('@')[0] || 'User';
        login({ name: displayName, email: me.email, role: me.role });
        setSessionCheck({ pathname, authenticated: true });
      })
      .catch(() => {
        if (cancelled) return;
        logout();
        setSessionCheck({ pathname, authenticated: false });
        router.replace('/auth/login');
      });

    return () => {
      cancelled = true;
    };
  }, [isPublicPage, login, logout, pathname, router]);

  if (!isPublicPage && (sessionCheck.pathname !== pathname || !sessionCheck.authenticated)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--lb-canvas)] px-6 text-sm font-semibold text-[var(--lb-muted)]" role="status" aria-live="polite">
        {t('Đang xác thực phiên…', 'Checking your session…')}
      </div>
    );
  }

  if (isPublicPage) {
    return (
      <div className="min-h-screen">
        <a className="skip-link" href="#main-content">{t('Bỏ qua đến nội dung chính', 'Skip to main content')}</a>
        {children}
      </div>
    );
  }

  return (
    <div className={isAdminPage ? 'h-screen overflow-hidden' : 'flex min-h-dvh flex-col overflow-x-clip'}>
      <a className="skip-link" href="#main-content">{t('Bỏ qua đến nội dung chính', 'Skip to main content')}</a>
      <TopBar showNavigation={showNavigation} onOpenNavigation={openMobileNavigation} />
      {showNavigation && (
        <MobileAppSidebar open={mobileNavigationOpen} onClose={closeMobileNavigation} />
      )}
      <div className={isAdminPage ? 'flex h-full min-h-0 pt-16' : 'flex min-h-0 flex-1 pt-16'}>
        {showNavigation && <AppSidebar />}
        <main
          id="main-content"
          tabIndex={-1}
          className={isAdminPage ? 'min-w-0 flex-1 overflow-y-auto' : 'flex min-w-0 flex-1 flex-col'}
        >
          {isAdminPage ? children : (
            <>
              <div className="min-w-0 flex-1 pb-10">{children}</div>
              {showNavigation && <Footer />}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
