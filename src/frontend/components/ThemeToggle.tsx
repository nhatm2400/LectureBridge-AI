'use client';

import { Moon, Sun } from 'lucide-react';

import { useI18n } from '@/lib/i18n';
import { useAppStore } from '@/store/useAppStore';
import { IconButton } from './ui/IconButton';

export function ThemeToggle() {
  const { theme, setTheme } = useAppStore();
  const { t } = useI18n();
  const label = theme === 'dark'
    ? t('Chuyển sang giao diện sáng', 'Switch to light mode')
    : t('Chuyển sang giao diện tối', 'Switch to dark mode');
  return (
    <IconButton
      label={label}
      onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
      suppressHydrationWarning
    >
      {theme === 'dark' ? <Sun size={19} /> : <Moon size={19} />}
    </IconButton>
  );
}
