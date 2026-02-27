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

  const rootClassName = [
    'grid gap-3',
    page === 'explore'
      ? 'grid-rows-[auto_minmax(0,1fr)] min-h-[calc(100vh-2.6rem)] overflow-hidden max-[1080px]:min-h-0 max-[1080px]:overflow-visible'
      : ''
  ]
    .filter(Boolean)
    .join(' ');

  const topbarClassName =
    'grid grid-cols-[auto_auto_1fr] items-center gap-[0.54rem] rounded-[18px] border border-[#d8e8d8] bg-[radial-gradient(circle_at_18%_5%,rgba(244,199,66,0.23),transparent_45%),linear-gradient(150deg,rgba(255,255,255,0.96),rgba(245,255,246,0.92))] px-[0.62rem] py-[0.56rem] shadow-[0_8px_22px_rgba(57,78,66,0.08)] max-[780px]:grid-cols-[1fr_auto] max-[780px]:gap-[0.44rem] max-[780px]:rounded-[14px] max-[780px]:p-2';
  const navTabClassName =
    'inline-flex items-center justify-center rounded-full border border-transparent px-[0.58rem] py-[0.34rem] text-[0.82rem] font-bold text-[#2f6542] no-underline';
  const navTabActiveClassName =
    'border-[#3f9f5f] bg-[linear-gradient(135deg,#56b36a,#359d59)] text-white';
  const authButtonClassName =
    'rounded-full bg-[linear-gradient(135deg,#56b36a,#2f9e58)] px-[0.68rem] py-[0.36rem] text-[0.8rem] leading-none text-white shadow-[0_4px_10px_rgba(47,158,88,0.16)] disabled:opacity-60';
  const localeButtonClassName =
    'min-w-[2.1rem] rounded-full px-2 py-1 text-[0.72rem] font-extrabold text-[#2f6542] shadow-none hover:bg-[rgba(89,178,109,0.14)]';

  return (
    <div className={rootClassName}>
      <header className={topbarClassName}>
        <div className="flex min-w-0 items-center gap-2">
          <Link
            href="/"
            className="inline-flex h-[1.9rem] w-[1.9rem] items-center justify-center rounded-full border border-[#3a9f5f] bg-[linear-gradient(135deg,#5fc676,#3ba860)] text-[0.66rem] font-extrabold tracking-[0.08em] text-white no-underline"
            aria-label={homeText.goToExploreAriaLabel}
          >
            PB
          </Link>
          <div className="grid gap-0.5">
            <h1 className="whitespace-nowrap text-[0.98rem] leading-tight max-[780px]:text-[0.92rem]">{homeText.appTitle}</h1>
            <small className="text-[0.73rem] leading-none max-[780px]:hidden">{homeText.appSubtitle}</small>
          </div>
        </div>
        <nav
          className="inline-flex w-auto justify-self-start gap-1 rounded-full border border-[#d7e8d7] bg-[rgba(246,255,245,0.92)] p-1 max-[780px]:order-3 max-[780px]:col-span-2 max-[780px]:grid max-[780px]:w-full max-[780px]:grid-cols-3 max-[780px]:rounded-xl"
          aria-label="Primary"
        >
          <Link href="/" className={page === 'explore' ? `${navTabClassName} ${navTabActiveClassName}` : navTabClassName}>
            {homeText.navExplore}
          </Link>
          <Link href="/create" className={page === 'create' ? `${navTabClassName} ${navTabActiveClassName}` : navTabClassName}>
            {homeText.navCreate}
          </Link>
          <Link href="/dashboard" className={page === 'dashboard' ? `${navTabClassName} ${navTabActiveClassName}` : navTabClassName}>
            {homeText.navDashboard}
          </Link>
        </nav>
        <div className="flex min-w-0 items-center justify-self-end gap-2 max-[780px]:gap-1.5">
          <small className="m-0 max-w-[200px] truncate rounded-full border border-[#d5e7d5] bg-[rgba(255,255,255,0.88)] px-[0.58rem] py-[0.3rem] text-[0.79rem] max-[780px]:hidden">{sessionText}</small>
          <div className="inline-flex items-center gap-0.5 rounded-full border border-[#d7e8d7] bg-[rgba(246,255,245,0.92)] p-0.5" role="group" aria-label={homeText.localeSwitchAriaLabel}>
            {supportedLocales.map((value) => (
              <button
                key={value}
                type="button"
                className={locale === value ? `${localeButtonClassName} bg-[linear-gradient(135deg,#56b36a,#359d59)] text-white` : localeButtonClassName}
                onClick={() => setLocale(value)}
              >
                {messages[value].localeLabel}
              </button>
            ))}
          </div>
          {isAuthenticated ? (
            <button
              type="button"
              className={authButtonClassName}
              onClick={() => signOut({ callbackUrl: page === 'create' ? '/create' : page === 'dashboard' ? '/dashboard' : '/' })}
            >
              {homeText.signOut}
            </button>
          ) : (
            <button type="button" className={authButtonClassName} onClick={() => signIn('google')}>
              {homeText.signIn}
            </button>
          )}
        </div>
      </header>
      <PostcardWorkbench mode={page} locale={locale} />
    </div>
  );
}
