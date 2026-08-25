'use client';

import * as React from 'react';

import { useAppStore } from '@/store/useAppStore';

export function LanguageController() {
  const locale = useAppStore((state) => state.locale);

  React.useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  return null;
}
