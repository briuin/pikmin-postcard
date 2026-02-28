import { en } from '@/lib/i18n/locales/en';
import { zhTW } from '@/lib/i18n/locales/zh-tw';

export const localeStorageKey = 'pikmin-postcard-locale';

export const supportedLocales = ['en', 'zh-TW'] as const;
export type Locale = (typeof supportedLocales)[number];

function normalizeLocale(input: string | null | undefined): Locale {
  if (!input) {
    return 'en';
  }

  const normalized = input.toLowerCase();
  if (normalized === 'zh-tw' || normalized === 'zh-hk' || normalized.startsWith('zh')) {
    return 'zh-TW';
  }

  return 'en';
}

export function detectLocale(input: string | null | undefined): Locale {
  return normalizeLocale(input);
}

export const messages = {
  en,
  'zh-TW': zhTW
} as const;

export type HomeText = typeof messages.en.home;
export type SessionText = typeof messages.en.session;
export type FeedbackText = typeof messages.en.feedback;
export type WorkbenchText = typeof messages.en.workbench;
export type AdminText = typeof messages.en.admin;
