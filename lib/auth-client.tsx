'use client';

import { UserApprovalStatus, UserRole } from '@prisma/client';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from 'react';
import { apiFetch, clearClientAuthToken, getClientAuthToken, setClientAuthToken } from '@/lib/client-api';

type SessionUser = {
  id: string;
  email: string;
  name: string | null;
  role: UserRole;
  approvalStatus: UserApprovalStatus;
};

type SessionData = {
  user: SessionUser;
};

type SessionStatus = 'loading' | 'authenticated' | 'unauthenticated';

type SessionHookResult = {
  data: SessionData | null;
  status: SessionStatus;
};

type AuthContextValue = SessionHookResult & {
  signInWithGoogle: () => Promise<void>;
  signOutUser: (options?: { callbackUrl?: string }) => Promise<void>;
};

type AuthExchangeResponse = {
  token: string;
  user: {
    id: string;
    email: string;
    displayName: string | null;
    role: 'ADMIN' | 'MANAGER' | 'MEMBER';
    approvalStatus: 'APPROVED' | 'PENDING';
  };
};

type AuthSessionResponse = {
  user: {
    id: string;
    email: string;
    displayName?: string | null;
    role?: 'ADMIN' | 'MANAGER' | 'MEMBER';
    approvalStatus?: 'APPROVED' | 'PENDING';
  } | null;
};

const AUTH_POPUP_CALLBACK_TYPE = 'pikmin-google-auth-callback';
const GOOGLE_AUTH_TIMEOUT_MS = 90_000;

const AuthContext = createContext<AuthContextValue | null>(null);

let globalSignInImpl: ((provider?: string) => Promise<void>) | null = null;
let globalSignOutImpl: ((options?: { callbackUrl?: string }) => Promise<void>) | null = null;
let cachedGoogleClientId: string | null = null;

function decodeBase64UrlJson<T>(value: string): T | null {
  try {
    const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    const json =
      typeof window !== 'undefined'
        ? decodeURIComponent(
            window
              .atob(padded)
              .split('')
              .map((char) => `%${char.charCodeAt(0).toString(16).padStart(2, '0')}`)
              .join('')
          )
        : Buffer.from(padded, 'base64').toString('utf8');
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}

function decodeJwtPayload<T extends { exp?: number }>(token: string): T | null {
  const parts = token.split('.');
  if (parts.length !== 3) {
    return null;
  }
  return decodeBase64UrlJson<T>(parts[1]);
}

function randomState(length = 32): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const bytes = new Uint8Array(length);
  if (typeof window !== 'undefined' && window.crypto?.getRandomValues) {
    window.crypto.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join('');
}

function parseHashFromMessage(data: unknown): string | null {
  if (!data || typeof data !== 'object') {
    return null;
  }
  const payload = data as { type?: unknown; hash?: unknown };
  if (payload.type !== AUTH_POPUP_CALLBACK_TYPE) {
    return null;
  }
  if (typeof payload.hash !== 'string') {
    return null;
  }
  return payload.hash;
}

function parseIdTokenFromHash(hash: string): { idToken: string; state: string } | null {
  const normalized = hash.startsWith('#') ? hash.slice(1) : hash;
  const params = new URLSearchParams(normalized);
  const idToken = params.get('id_token');
  const state = params.get('state');
  if (!idToken || !state) {
    return null;
  }
  return { idToken, state };
}

async function requestGoogleIdTokenViaPopup(clientId: string): Promise<string> {
  if (typeof window === 'undefined') {
    throw new Error('Google sign-in is only available in browser.');
  }

  const state = randomState();
  const nonce = randomState();
  const redirectUri = `${window.location.origin}/auth/callback`;
  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('response_type', 'id_token');
  authUrl.searchParams.set('scope', 'openid email profile');
  authUrl.searchParams.set('prompt', 'select_account');
  authUrl.searchParams.set('nonce', nonce);
  authUrl.searchParams.set('state', state);

  const width = 520;
  const height = 680;
  const left = window.screenX + Math.max(0, (window.outerWidth - width) / 2);
  const top = window.screenY + Math.max(0, (window.outerHeight - height) / 2);
  const popup = window.open(
    authUrl.toString(),
    'pikmin_google_auth',
    `popup=yes,width=${width},height=${height},left=${Math.round(left)},top=${Math.round(top)}`
  );
  if (!popup) {
    throw new Error('Popup blocked. Please allow popups and try again.');
  }

  return await new Promise<string>((resolve, reject) => {
    let settled = false;
    const finish = (run: () => void) => {
      if (settled) {
        return;
      }
      settled = true;
      window.removeEventListener('message', onMessage);
      window.clearInterval(closePoll);
      window.clearTimeout(timeout);
      run();
    };

    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) {
        return;
      }

      const hash = parseHashFromMessage(event.data);
      if (!hash) {
        return;
      }

      const parsed = parseIdTokenFromHash(hash);
      if (!parsed) {
        finish(() => reject(new Error('Google login did not return an ID token.')));
        return;
      }
      if (parsed.state !== state) {
        finish(() => reject(new Error('Google login state mismatch. Please try again.')));
        return;
      }

      try {
        popup.close();
      } catch {
        // noop
      }

      finish(() => resolve(parsed.idToken));
    };

    const closePoll = window.setInterval(() => {
      if (popup.closed) {
        finish(() => reject(new Error('Google login popup was closed before completion.')));
      }
    }, 400);

    const timeout = window.setTimeout(() => {
      try {
        popup.close();
      } catch {
        // noop
      }
      finish(() => reject(new Error('Google login timed out. Please try again.')));
    }, GOOGLE_AUTH_TIMEOUT_MS);

    window.addEventListener('message', onMessage);
  });
}

async function resolveGoogleClientId(): Promise<string> {
  if (cachedGoogleClientId && cachedGoogleClientId.trim().length > 0) {
    return cachedGoogleClientId;
  }

  const fromEnv = (process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? '').trim();
  if (fromEnv) {
    cachedGoogleClientId = fromEnv;
    return fromEnv;
  }

  const response = await fetch('/api/auth/google-client-id', { cache: 'no-store' });
  if (!response.ok) {
    throw new Error('Google sign-in is not configured.');
  }
  const payload = (await response.json()) as { clientId?: string };
  const clientId = String(payload.clientId || '').trim();
  if (!clientId) {
    throw new Error('Google sign-in is not configured.');
  }

  cachedGoogleClientId = clientId;
  return clientId;
}

function sessionFromExchange(payload: AuthExchangeResponse): SessionData {
  return {
    user: {
      id: payload.user.id,
      email: payload.user.email,
      name: payload.user.displayName ?? null,
      role: payload.user.role,
      approvalStatus: payload.user.approvalStatus
    }
  };
}

function sessionFromAuthUser(user: NonNullable<AuthSessionResponse['user']>): SessionData {
  return {
    user: {
      id: user.id,
      email: user.email,
      name: user.displayName ?? null,
      role:
        user.role === UserRole.ADMIN || user.role === UserRole.MANAGER
          ? user.role
          : UserRole.MEMBER,
      approvalStatus:
        user.approvalStatus === UserApprovalStatus.APPROVED
          ? UserApprovalStatus.APPROVED
          : UserApprovalStatus.PENDING
    }
  };
}

function sessionFromBearerToken(token: string): SessionData | null {
  const payload = decodeJwtPayload<{
    sub?: string;
    email?: string;
    name?: string | null;
    role?: UserRole;
    approvalStatus?: UserApprovalStatus;
    exp?: number;
  }>(token);
  if (!payload?.sub || !payload.email || !payload.exp) {
    return null;
  }
  if (payload.exp * 1000 <= Date.now()) {
    return null;
  }
  const role =
    payload.role === UserRole.ADMIN || payload.role === UserRole.MANAGER
      ? payload.role
      : UserRole.MEMBER;
  const approvalStatus =
    payload.approvalStatus === UserApprovalStatus.APPROVED
      ? UserApprovalStatus.APPROVED
      : UserApprovalStatus.PENDING;

  return {
    user: {
      id: payload.sub,
      email: payload.email,
      name: payload.name ?? null,
      role,
      approvalStatus
    }
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<SessionStatus>('loading');
  const [session, setSession] = useState<SessionData | null>(null);

  const signOutUser = useCallback(async (options?: { callbackUrl?: string }) => {
    clearClientAuthToken();
    setSession(null);
    setStatus('unauthenticated');
    if (options?.callbackUrl && typeof window !== 'undefined') {
      window.location.assign(options.callbackUrl);
    }
  }, []);

  const signInWithGoogle = useCallback(async () => {
    const googleClientId = await resolveGoogleClientId();

    const googleIdToken = await requestGoogleIdTokenViaPopup(googleClientId);
    const response = await apiFetch('/api/auth/exchange', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken: googleIdToken })
    });

    if (!response.ok) {
      let details = 'Failed to sign in with Google.';
      try {
        const payload = (await response.json()) as { error?: string; details?: string };
        details = payload.details || payload.error || details;
      } catch {
        // ignore json parse error
      }
      throw new Error(details);
    }

    const payload = (await response.json()) as AuthExchangeResponse;
    if (!payload?.token || !payload?.user?.id || !payload?.user?.email) {
      throw new Error('Invalid auth exchange response.');
    }

    setClientAuthToken(payload.token);
    setSession(sessionFromExchange(payload));
    setStatus('authenticated');
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function restoreSession() {
      const token = getClientAuthToken();
      if (!token) {
        if (!cancelled) {
          setSession(null);
          setStatus('unauthenticated');
        }
        return;
      }

      const restored = sessionFromBearerToken(token);
      if (!restored) {
        clearClientAuthToken();
        if (!cancelled) {
          setSession(null);
          setStatus('unauthenticated');
        }
        return;
      }

      try {
        const sessionResponse = await apiFetch('/api/auth/session', { cache: 'no-store' });
        if (sessionResponse.ok) {
          const payload = (await sessionResponse.json()) as AuthSessionResponse;
          if (payload.user?.id && payload.user?.email) {
            if (!cancelled) {
              setSession(sessionFromAuthUser(payload.user));
              setStatus('authenticated');
            }
            return;
          }
        }
      } catch {
        // fall back to token payload
      }

      if (!cancelled) {
        setSession(restored);
        setStatus('authenticated');
      }
    }

    void restoreSession();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    globalSignInImpl = async (provider?: string) => {
      if (provider && provider !== 'google') {
        throw new Error('Only Google sign-in is supported.');
      }
      await signInWithGoogle();
    };
    globalSignOutImpl = async (options?: { callbackUrl?: string }) => {
      await signOutUser(options);
    };

    return () => {
      globalSignInImpl = null;
      globalSignOutImpl = null;
    };
  }, [signInWithGoogle, signOutUser]);

  const value = useMemo<AuthContextValue>(
    () => ({
      data: session,
      status,
      signInWithGoogle,
      signOutUser
    }),
    [session, signInWithGoogle, signOutUser, status]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useSession(): SessionHookResult {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useSession must be used within AuthProvider.');
  }
  return {
    data: context.data,
    status: context.status
  };
}

export async function signIn(provider = 'google'): Promise<void> {
  if (!globalSignInImpl) {
    throw new Error('Auth provider is not ready.');
  }
  await globalSignInImpl(provider);
}

export async function signOut(options?: { callbackUrl?: string }): Promise<void> {
  if (!globalSignOutImpl) {
    throw new Error('Auth provider is not ready.');
  }
  await globalSignOutImpl(options);
}
