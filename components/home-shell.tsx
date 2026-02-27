'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { signIn, signOut, useSession } from 'next-auth/react';
import { detectLocale, localeStorageKey, messages, supportedLocales, type Locale } from '@/lib/i18n';
import { PostcardWorkbench } from '@/components/postcard-workbench';

type HomeShellProps = {
  page: 'explore' | 'create' | 'dashboard';
};

function formatSessionText(
  email: string | null | undefined,
  isLoading: boolean,
  locale: Locale
): string {
  const text = messages[locale].session;

  if (isLoading) {
    return text.checking;
  }
  if (!email) {
    return text.guest;
  }

  const [local, domain] = email.split('@');
  if (!local || !domain) {
    return text.signedIn;
  }

  const localMasked = local.length <= 3 ? `${local[0] ?? '*'}**` : `${local.slice(0, 3)}***`;
  return `${localMasked}@${domain}`;
}

export function HomeShell({ page }: HomeShellProps) {
  const [locale, setLocale] = useState<Locale>('en');
  const { data: session, status } = useSession();
  const isAuthenticated = status === 'authenticated';
  const isLoading = status === 'loading';
  const homeText = messages[locale].home;
  const sessionText = formatSessionText(session?.user?.email ?? null, isLoading, locale);

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

  return (
    <div className={`home-shell home-shell-${page}`}>
      <header className="topbar">
        <div className="topbar-brand">
          <Link href="/" className="brand-mark" aria-label={homeText.goToExploreAriaLabel}>
            PB
          </Link>
          <div className="brand-copy">
            <h1>{homeText.appTitle}</h1>
            <small>{homeText.appSubtitle}</small>
          </div>
        </div>
        <nav className="topbar-nav" aria-label="Primary">
          <Link href="/" className={page === 'explore' ? 'nav-tab nav-tab-active' : 'nav-tab'}>
            {homeText.navExplore}
          </Link>
          <Link href="/create" className={page === 'create' ? 'nav-tab nav-tab-active' : 'nav-tab'}>
            {homeText.navCreate}
          </Link>
          <Link href="/dashboard" className={page === 'dashboard' ? 'nav-tab nav-tab-active' : 'nav-tab'}>
            {homeText.navDashboard}
          </Link>
        </nav>
        <div className="topbar-session">
          <small className="session-pill">{sessionText}</small>
          <div className="locale-switch" role="group" aria-label={homeText.localeSwitchAriaLabel}>
            {supportedLocales.map((value) => (
              <button
                key={value}
                type="button"
                className={locale === value ? 'locale-button locale-button-active' : 'locale-button'}
                onClick={() => setLocale(value)}
              >
                {messages[value].localeLabel}
              </button>
            ))}
          </div>
          {isAuthenticated ? (
            <button
              type="button"
              className="topbar-auth-btn"
              onClick={() => signOut({ callbackUrl: page === 'create' ? '/create' : page === 'dashboard' ? '/dashboard' : '/' })}
            >
              {homeText.signOut}
            </button>
          ) : (
            <button type="button" className="topbar-auth-btn" onClick={() => signIn('google')}>
              {homeText.signIn}
            </button>
          )}
        </div>
      </header>
      <PostcardWorkbench mode={page} locale={locale} />
    </div>
  );
}
