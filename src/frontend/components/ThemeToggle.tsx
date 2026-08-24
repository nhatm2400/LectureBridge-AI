'use client';

import { Moon, Sun } from 'lucide-react';

import { useAppStore } from '@/store/useAppStore';
import { IconButton } from './ui/IconButton';

export function ThemeToggle() {
  const { theme, setTheme } = useAppStore();
  const label = theme === 'dark' ? 'Chuyển sang giao diện sáng' : 'Chuyển sang giao diện tối';
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
