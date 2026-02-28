'use client';

import { useEffect, useState } from 'react';
import { detectLocale, localeStorageKey, type Locale } from '@/lib/i18n';

export function usePersistedLocale(initialLocale: Locale = 'en') {
  const [locale, setLocale] = useState<Locale>(initialLocale);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const stored = window.localStorage.getItem(localeStorageKey);
    setLocale(detectLocale(stored ?? window.navigator.language));
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(localeStorageKey, locale);
  }, [locale]);

  return { locale, setLocale };
}
