'use client';

import * as React from 'react';

import { type Locale, useAppStore } from '@/store/useAppStore';

export type Translate = (vi: string, en: string) => string;

export function useI18n() {
  const locale = useAppStore((state) => state.locale);
  const setLocale = useAppStore((state) => state.setLocale);
  const t = React.useCallback<Translate>((vi, en) => (locale === 'en' ? en : vi), [locale]);

  return { locale, setLocale, t };
}

export function localeCode(locale: Locale) {
  return locale === 'en' ? 'en-US' : 'vi-VN';
}
