'use client';

import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { usePersistedLocale } from '@/components/use-persisted-locale';
import { useAuth, useSession } from '@/lib/auth-client';
import { messages, supportedLocales } from '@/lib/i18n';

type LoginPageProps = {
  nextPath: string;
};

export function LoginPage({ nextPath }: LoginPageProps) {
  const router = useRouter();
  const { locale, setLocale } = usePersistedLocale('en');
  const { data: session, status } = useSession();
  const { signInWithAccount, signInWithGoogle } = useAuth();
  const text = messages[locale].authPage;

  const [accountId, setAccountId] = useState('');
  const [password, setPassword] = useState('');
  const [busyMode, setBusyMode] = useState<'account' | 'google' | null>(null);
  const [errorText, setErrorText] = useState('');

  useEffect(() => {
    if (status === 'authenticated' && session?.user?.id) {
      router.replace(nextPath);
    }
  }, [nextPath, router, session?.user?.id, status]);

  async function handleAccountSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusyMode('account');
    setErrorText('');
    try {
      await signInWithAccount(accountId, password);
      router.replace(nextPath);
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : text.accountSubmitFailed);
    } finally {
      setBusyMode(null);
    }
  }

  async function handleGoogleSignIn() {
    setBusyMode('google');
    setErrorText('');
    try {
      await signInWithGoogle();
      router.replace(nextPath);
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : text.googleSubmitFailed);
    } finally {
      setBusyMode(null);
    }
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(244,199,66,0.16),transparent_30%),linear-gradient(180deg,#f6fff4,#edf8ff)] px-4 py-6">
      <div className="mx-auto grid max-w-[1040px] gap-4">
        <header className="flex flex-wrap items-center justify-between gap-3 rounded-[22px] border border-[#d8e8d8] bg-[rgba(255,255,255,0.92)] px-4 py-3 shadow-[0_10px_26px_rgba(57,78,66,0.08)]">
          <div className="grid gap-1">
            <Link
              href="/"
              className="text-[0.78rem] font-extrabold uppercase tracking-[0.12em] text-[#3b8d56] no-underline"
            >
              Pikmin Postcards
            </Link>
            <strong className="text-[1.45rem] text-[#234032]">{text.title}</strong>
            <small className="text-[#587466]">{text.subtitle}</small>
          </div>

          <div
            className="inline-flex items-center gap-1 rounded-full border border-[#d7e8d7] bg-[rgba(246,255,245,0.92)] p-1"
            role="group"
            aria-label={messages[locale].home.localeSwitchAriaLabel}
          >
            {supportedLocales.map((value) => (
              <button
                key={value}
                type="button"
                className={
                  locale === value
                    ? 'min-w-[2.1rem] rounded-full bg-[linear-gradient(135deg,#56b36a,#359d59)] px-2 py-1 text-[0.72rem] font-extrabold text-white'
                    : 'min-w-[2.1rem] rounded-full px-2 py-1 text-[0.72rem] font-extrabold text-[#2f6542]'
                }
                onClick={() => setLocale(value)}
              >
                {messages[value].localeLabel}
              </button>
            ))}
          </div>
        </header>

        <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.82fr)]">
          <article className="grid gap-3 rounded-[24px] border border-[#dcebd9] bg-[rgba(255,255,255,0.94)] p-5 shadow-[0_12px_30px_rgba(49,83,68,0.08)]">
            <div className="grid gap-1">
              <strong className="text-[1.1rem] text-[#234032]">{text.accountCardTitle}</strong>
              <small className="text-[#587466]">{text.accountCardBody}</small>
            </div>

            <form className="grid gap-3" onSubmit={(event) => void handleAccountSubmit(event)}>
              <label className="grid gap-1 text-[0.92rem] font-semibold text-[#264534]">
                {text.accountIdLabel}
                <input
                  className="rounded-[16px] border border-[#cfe3cc] bg-white px-3 py-2.5 text-[0.96rem] text-[#1d3429] outline-none ring-0 placeholder:text-[#87a093]"
                  value={accountId}
                  onChange={(event) => setAccountId(event.target.value)}
                  placeholder={text.accountIdPlaceholder}
                  autoCapitalize="none"
                  autoCorrect="off"
                />
              </label>

              <label className="grid gap-1 text-[0.92rem] font-semibold text-[#264534]">
                {text.passwordLabel}
                <input
                  className="rounded-[16px] border border-[#cfe3cc] bg-white px-3 py-2.5 text-[0.96rem] text-[#1d3429] outline-none ring-0 placeholder:text-[#87a093]"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder={text.passwordPlaceholder}
                  type="password"
                />
              </label>

              {errorText ? (
                <div className="rounded-[16px] border border-[#f3c4b6] bg-[#fff6f3] px-3 py-2 text-[0.9rem] text-[#9a4a31]">
                  {errorText}
                </div>
              ) : null}

              <button
                type="submit"
                className="rounded-full bg-[linear-gradient(135deg,#56b36a,#2f9e58)] px-4 py-2.5 text-[0.95rem] font-bold text-white shadow-[0_8px_18px_rgba(47,158,88,0.2)] disabled:opacity-60"
                disabled={busyMode !== null}
              >
                {busyMode === 'account' ? text.accountSubmitBusy : text.accountSubmit}
              </button>
            </form>
          </article>

          <aside className="grid gap-3 rounded-[24px] border border-[#dcebd9] bg-[linear-gradient(165deg,rgba(245,255,245,0.96),rgba(248,252,255,0.96))] p-5 shadow-[0_12px_30px_rgba(49,83,68,0.08)]">
            <div className="grid gap-1">
              <strong className="text-[1.1rem] text-[#234032]">{text.googleCardTitle}</strong>
              <small className="text-[#587466]">{text.googleCardBody}</small>
            </div>

            <button
              type="button"
              className="rounded-full border border-[#3c955b] bg-white px-4 py-2.5 text-[0.95rem] font-bold text-[#25653d] shadow-[0_6px_16px_rgba(53,121,77,0.12)] disabled:opacity-60"
              onClick={() => void handleGoogleSignIn()}
              disabled={busyMode !== null}
            >
              {busyMode === 'google' ? text.googleSubmitBusy : text.googleSubmit}
            </button>

            <div className="grid gap-2 rounded-[18px] border border-[#d7e7d4] bg-[rgba(255,255,255,0.88)] px-3 py-3 text-[0.92rem] text-[#365347]">
              <strong>{text.helpTitle}</strong>
              <p className="m-0">{text.helpBody}</p>
              <p className="m-0">
                <Link href="/profile" className="font-semibold text-[#2c8b4f]">
                  {text.profileLink}
                </Link>
              </p>
            </div>
          </aside>
        </section>
      </div>
    </main>
  );
}
