'use client';

import {
  BookOpen,
  FileText,
  Grid2X2,
  History,
  MessageSquare,
  Settings,
  Upload,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import React from 'react';

import { cn } from '@/lib/utils';
import { Drawer } from '@/components/ui/Drawer';

type SidebarItem = {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  href: string;
};

function SidebarNavigation({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const [activeHash, setActiveHash] = React.useState('');

  React.useEffect(() => {
    if (pathname === '/admin' && !window.location.hash) {
      window.history.replaceState(null, '', '#overview');
      setActiveHash('#overview');
    } else {
      setActiveHash(window.location.hash);
    }
    const handleHashChange = () => setActiveHash(window.location.hash);
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [pathname]);

  const isAdminArea = pathname.startsWith('/admin');
  const learningItems: SidebarItem[] = isAdminArea
    ? [
        { icon: Grid2X2, label: 'Tổng quan admin', href: '/admin#overview' },
        { icon: BookOpen, label: 'Quản lý khóa học', href: '/admin#courses' },
        { icon: MessageSquare, label: 'Tiến độ xử lý', href: '/admin#jobs' },
        { icon: History, label: 'Nhật ký xóa', href: '/admin#deletion-history' },
      ]
    : [
        { icon: Grid2X2, label: 'Thư viện', href: '/student/library' },
        { icon: BookOpen, label: 'Khóa học đã đăng ký', href: '/student/documents' },
        { icon: MessageSquare, label: 'Đánh giá', href: '/student/reviews' },
        { icon: FileText, label: 'Lượt làm bài quiz', href: '/student/quiz-attempts' },
      ];
  const toolItems: SidebarItem[] = isAdminArea
    ? [{ icon: Upload, label: 'Đăng tải bài giảng', href: '/admin#upload' }]
    : [{ icon: Upload, label: 'Tải video lên', href: '/student/upload' }];
  const accountItems: SidebarItem[] = isAdminArea
    ? [{ icon: Settings, label: 'Cài đặt hệ thống', href: '/admin#settings' }]
    : [{ icon: Settings, label: 'Cài đặt và hồ sơ', href: '/student/settings' }];

  const isItemActive = (href: string) => {
    const [baseHref, hash] = href.split('#');
    const effectiveHash = pathname === '/admin' ? activeHash || '#overview' : activeHash;
    if (hash) return pathname === baseHref && effectiveHash === `#${hash}`;
    return pathname === baseHref || (pathname.startsWith(`${baseHref}/`) && baseHref !== '/admin');
  };

  const navigateAdminHash = (href: string) => {
    const [baseHref, hash] = href.split('#');
    if (pathname !== '/admin' || baseHref !== '/admin' || !hash) return false;
    const nextHash = `#${hash}`;
    setActiveHash(nextHash);
    if (window.location.hash !== nextHash) window.history.replaceState(null, '', nextHash);
    const target = document.getElementById(hash);
    const container = document.getElementById('main-content');
    if (target && container) {
      const desired = container.scrollTop + target.getBoundingClientRect().top - container.getBoundingClientRect().top - 16;
      container.scrollTo({ top: Math.max(0, desired), behavior: 'smooth' });
    } else {
      target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    return true;
  };

  const renderSection = (title: string, items: SidebarItem[]) => (
    <section className="mt-7 first:mt-0" aria-label={title}>
      <p className="mb-2 px-3 text-[11px] font-bold tracking-[0.08em] text-[var(--lb-subtle)]">{title}</p>
      <nav className="space-y-1">
        {items.map((item) => {
          const isActive = isItemActive(item.href);
          return (
            <Link
              key={`${title}-${item.label}`}
              href={item.href}
              aria-current={isActive ? 'page' : undefined}
              className={cn(
                'relative flex min-h-11 items-center gap-3 rounded-md px-3 py-2 text-sm font-semibold transition-colors duration-150',
                isActive
                  ? 'bg-[var(--lb-accent-soft)] text-[var(--lb-ink)]'
                  : 'text-[var(--lb-muted)] hover:bg-[var(--lb-elevated)] hover:text-[var(--lb-ink)]',
              )}
              onClick={(event) => {
                if (navigateAdminHash(item.href)) event.preventDefault();
                const hash = item.href.split('#')[1];
                setActiveHash(hash ? `#${hash}` : '');
                onNavigate?.();
              }}
            >
              {isActive && <span className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-[var(--lb-accent)]" aria-hidden="true" />}
              <item.icon size={18} className={isActive ? 'text-[var(--lb-accent)]' : 'text-[var(--lb-subtle)]'} aria-hidden="true" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </section>
  );

  return (
    <div className="px-3 py-5">
      {renderSection('Học tập', learningItems)}
      {renderSection('Công cụ', toolItems)}
      {renderSection('Tài khoản', accountItems)}
    </div>
  );
}

export function AppSidebar() {
  return (
    <aside className="sticky top-16 hidden h-[calc(100vh-64px)] w-56 min-w-56 shrink-0 self-start overflow-y-auto border-r border-[var(--lb-border)] bg-[var(--lb-surface)] lg:block" aria-label="Điều hướng chính">
      <SidebarNavigation />
    </aside>
  );
}

export function MobileAppSidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Drawer open={open} onClose={onClose} title="Điều hướng">
      <SidebarNavigation onNavigate={onClose} />
    </Drawer>
  );
}
