'use client';

import Link from 'next/link';
import { signIn, signOut, useSession } from 'next-auth/react';
import { PostcardWorkbench } from '@/components/postcard-workbench';

type HomeShellProps = {
  page: 'explore' | 'create' | 'dashboard';
};

function formatSessionText(email: string | null | undefined, isLoading: boolean): string {
  if (isLoading) {
    return 'Checking session...';
  }
  if (!email) {
    return 'Guest mode';
  }

  const [local, domain] = email.split('@');
  if (!local || !domain) {
    return 'Signed in';
  }

  const localMasked = local.length <= 3 ? `${local[0] ?? '*'}**` : `${local.slice(0, 3)}***`;
  return `${localMasked}@${domain}`;
}

export function HomeShell({ page }: HomeShellProps) {
  const { data: session, status } = useSession();
  const isAuthenticated = status === 'authenticated';
  const isLoading = status === 'loading';
  const sessionText = formatSessionText(session?.user?.email ?? null, isLoading);

  return (
    <div className={`home-shell home-shell-${page}`}>
      <header className="topbar">
        <div className="topbar-brand">
          <Link href="/" className="brand-mark" aria-label="Go to Explore">
            PB
          </Link>
          <div className="brand-copy">
            <h1>Pikmin Postcards</h1>
            <small>Map + AI location</small>
          </div>
        </div>
        <nav className="topbar-nav" aria-label="Primary">
          <Link href="/" className={page === 'explore' ? 'nav-tab nav-tab-active' : 'nav-tab'}>
            Explore
          </Link>
          <Link href="/create" className={page === 'create' ? 'nav-tab nav-tab-active' : 'nav-tab'}>
            Create
          </Link>
          <Link href="/dashboard" className={page === 'dashboard' ? 'nav-tab nav-tab-active' : 'nav-tab'}>
            Dashboard
          </Link>
        </nav>
        <div className="topbar-session">
          <small className="session-pill">{sessionText}</small>
          {isAuthenticated ? (
            <button
              type="button"
              className="topbar-auth-btn"
              onClick={() => signOut({ callbackUrl: page === 'create' ? '/create' : page === 'dashboard' ? '/dashboard' : '/' })}
            >
              Sign out
            </button>
          ) : (
            <button type="button" className="topbar-auth-btn" onClick={() => signIn('google')}>
              Sign in
            </button>
          )}
        </div>
      </header>
      <PostcardWorkbench mode={page} />
    </div>
  );
}
