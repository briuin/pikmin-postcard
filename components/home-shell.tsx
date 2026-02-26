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
  const subtitle =
    page === 'explore'
      ? 'Browse postcards on the map without login.'
      : page === 'create'
        ? 'Sign in with Google to submit AI detection and create new postcard entries.'
        : 'Your private dashboard for AI detection jobs and your own postcards.';

  return (
    <div className="home-shell">
      <header className="hero panel">
        <div className="hero-copy">
          <p className="eyebrow">Pikmin Bloom Companion</p>
          <h1>Postcard Garden Map</h1>
          <p className="hero-subtitle">{subtitle}</p>
          <nav className="hero-nav" aria-label="Primary">
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
          <div className="hero-badges">
            <span className="badge badge-public">Public: Explore + Search</span>
            <span className="badge badge-private">Login: AI + Add Postcard</span>
          </div>
        </div>
        <div className="session-card">
          <small className="session-label">Session</small>
          <p className="session-value">{isLoading ? 'Checking session...' : isAuthenticated ? session?.user?.email : 'Viewing as guest'}</p>
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
