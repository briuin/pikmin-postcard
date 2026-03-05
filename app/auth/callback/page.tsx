'use client';

import { useEffect } from 'react';

const CALLBACK_MESSAGE_TYPE = 'pikmin-google-auth-callback';

export default function GoogleAuthCallbackPage() {
  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const hash = window.location.hash || '';
    try {
      if (window.opener && hash) {
        window.opener.postMessage(
          {
            type: CALLBACK_MESSAGE_TYPE,
            hash
          },
          window.location.origin
        );
      }
    } finally {
      window.close();
    }
  }, []);

  return (
    <main className="grid min-h-[100vh] place-items-center px-4">
      <p className="text-sm text-[#365347]">Completing sign in...</p>
    </main>
  );
}
