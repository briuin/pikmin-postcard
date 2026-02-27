'use client';

import Link from 'next/link';
import { signIn, signOut, useSession } from 'next-auth/react';
import { PostcardWorkbench } from '@/components/postcard-workbench';

type HomeShellProps = {
  page: 'explore' | 'create' | 'dashboard';
};

export function HomeShell({ page }: HomeShellProps) {
  const { data: session, status } = useSession();
  const isAuthenticated = status === 'authenticated';
  const isLoading = status === 'loading';

  return (
    <div className="home-shell">
      <header className="topbar panel">
        <div className="topbar-main">
          <div className="topbar-brand">
            <span className="brand-pikmin" aria-hidden>
              P
            </span>
            <h1>Pikmin Postcards</h1>
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
        </div>
        <div className="session-inline">
          <small>{isLoading ? 'Checking session...' : isAuthenticated ? session?.user?.email : 'Guest mode'}</small>
          {isAuthenticated ? (
            <button type="button" onClick={() => signOut({ callbackUrl: page === 'create' ? '/create' : page === 'dashboard' ? '/dashboard' : '/' })}>
              Sign out
            </button>
          ) : (
            <button type="button" onClick={() => signIn('google')}>
              Sign in with Google
            </button>
          )}
        </div>
      </header>
      <PostcardWorkbench mode={page} />
    </div>
  );
}
