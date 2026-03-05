'use client';

import { AuthProvider as BearerAuthProvider } from '@/lib/auth-client';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  return <BearerAuthProvider>{children}</BearerAuthProvider>;
}
