'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Grid,
  BookOpen,
  Upload,
  Settings,
  MessageSquare,
  FileText,
  History,
} from 'lucide-react';
import { cn } from '@/lib/utils';

type SidebarItem = {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  href: string;
};

export function AppSidebar() {
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

  const sectionLabelClass = cn(
    'font-heading mb-3 ml-3 inline-block rounded-lg bg-primary/5 px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-widest text-primary'
  );

  const itemClass = (isActive: boolean) =>
    cn(
      'group relative flex items-center gap-3 rounded-xl px-3 py-2.5 transition-all',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60',
      isActive
        ? 'font-heading font-extrabold text-primary'
        : 'font-heading font-bold text-[var(--app-text-muted)] hover:bg-[var(--app-surface-muted)] hover:text-[var(--app-text)]'
    );

  const iconClass = (isActive: boolean) =>
    cn(
      'shrink-0 transition-colors',
      isActive ? 'text-primary' : 'text-[var(--app-text-subtle)] group-hover:text-[var(--app-text)]'
    );

  const studentLearningItems: SidebarItem[] = [
    { icon: Grid, label: 'Tổng quan', href: '/student/library' },
    { icon: BookOpen, label: 'Khóa học đã đăng ký', href: '/student/documents' },
    { icon: MessageSquare, label: 'Đánh giá', href: '/student/reviews' },
    { icon: FileText, label: 'Lượt làm bài quiz', href: '/student/quiz-attempts' },
  ];

  const adminLearningItems: SidebarItem[] = [
    { icon: Grid, label: 'Tổng quan admin', href: '/admin#overview' },
    { icon: BookOpen, label: 'Quản lý khóa học', href: '/admin#courses' },
    { icon: MessageSquare, label: 'Tiến độ xử lý', href: '/admin#jobs' },
    { icon: History, label: 'Nhật ký xóa', href: '/admin#deletion-history' },
  ];

  const learningItems = isAdminArea ? adminLearningItems : studentLearningItems;

  const toolItems: SidebarItem[] = isAdminArea
    ? [{ icon: Upload, label: 'Đăng tải bài giảng', href: '/admin#upload' }]
    : [{ icon: Upload, label: 'Tải video lên', href: '/student/upload' }];

  const accountItems: SidebarItem[] = isAdminArea
    ? [{ icon: Settings, label: 'Cài đặt hệ thống', href: '/admin#settings' }]
    : [{ icon: Settings, label: 'Cài đặt & hồ sơ', href: '/student/settings' }];

  const isItemActive = (href: string) => {
    const [baseHref, hash] = href.split('#');
    const effectiveHash = pathname === '/admin' ? activeHash || '#overview' : activeHash;
    if (hash) {
      return pathname === baseHref && effectiveHash === `#${hash}`;
    }
    return pathname === baseHref || (pathname.startsWith(`${baseHref}/`) && baseHref !== '/admin');
  };

  const navigateAdminHash = (href: string) => {
    const [baseHref, hash] = href.split('#');
    if (pathname !== '/admin' || baseHref !== '/admin' || !hash) return false;

    const nextHash = `#${hash}`;
    setActiveHash(nextHash);
    if (window.location.hash !== nextHash) {
      window.history.replaceState(null, '', nextHash);
    }

    const target = document.getElementById(hash);
    const container = document.getElementById('app-main-scroll');
    if (target && container) {
      const targetTop = target.getBoundingClientRect().top;
      const containerTop = container.getBoundingClientRect().top;
      const currentScroll = container.scrollTop;
      const desired = currentScroll + (targetTop - containerTop) - 10;
      container.scrollTo({ top: Math.max(0, desired), behavior: 'smooth' });
    } else if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else if (container) {
      container.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
    return true;
  };

  const renderSection = (title: string, items: SidebarItem[]) => (
    <div className="mt-8 first:mt-0">
      <p className={sectionLabelClass}>{title}</p>
      <nav className="space-y-1">
        {items.map((item) => {
          const isActive = isItemActive(item.href);
          return (
            <Link
              key={`${title}-${item.label}`}
              href={item.href}
              className={itemClass(isActive)}
              onClick={(event) => {
                if (navigateAdminHash(item.href)) {
                  event.preventDefault();
                  return;
                }
                const h = item.href.split('#')[1];
                setActiveHash(h ? `#${h}` : '');
              }}
            >
              {isActive && <div className="absolute left-0 h-5 w-1 rounded-r-full bg-primary" />}
              <item.icon size={18} className={iconClass(isActive)} />
              <span className="text-[13px]">{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );

  return (
    <aside
      className={cn(
        'sticky top-20 hidden h-[calc(100vh-80px)] w-[240px] min-w-[240px] shrink-0 self-start border-r border-[var(--app-border-subtle)] bg-[var(--app-surface)] lg:flex'
      )}
    >
      <div className="scrollbar-hide flex-1 overflow-y-auto px-3 py-6">
        {renderSection('TRANG CHỦ', learningItems)}
        {renderSection('CÔNG CỤ', toolItems)}
        {renderSection('CÀI ĐẶT TÀI KHOẢN', accountItems)}
      </div>
    </aside>
  );
}
