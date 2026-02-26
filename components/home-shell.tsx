'use client';

import { signIn, signOut, useSession } from 'next-auth/react';
import { PostcardWorkbench } from '@/components/postcard-workbench';

export function HomeShell() {
  const { data: session, status } = useSession();

  if (status === 'loading') {
    return <small>Loading session...</small>;
  }

  if (status === 'unauthenticated') {
    return (
      <section className="panel" style={{ maxWidth: '560px' }}>
        <h2 style={{ marginBottom: '0.6rem' }}>Sign in Required</h2>
        <small>Use Google account login to continue.</small>
        <div style={{ marginTop: '1rem' }}>
          <button type="button" onClick={() => signIn('google')}>
            Continue with Google
          </button>
        </div>
      </section>
    );
  }

  return (
    <>
      <header style={{ marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', gap: '1rem' }}>
        <div>
          <h1>Pikmin Bloom Postcard</h1>
          <small>Upload postcard photos, detect location with Gemini, and organize on an open map.</small>
        </div>
        <div style={{ textAlign: 'right' }}>
          <small>{session?.user?.email}</small>
          <div style={{ marginTop: '0.45rem' }}>
            <button type="button" onClick={() => signOut({ callbackUrl: '/' })}>
              Sign out
            </button>
          </div>
        </div>
      </header>
      <PostcardWorkbench />
    </>
  );
}
