import crypto from 'node:crypto';
import type { UserApprovalStatus, UserRole } from '@/lib/domain/enums';
import { resolveAccountId } from '@/lib/account-id';

export const AUTH_PASSWORD_MIN_LENGTH = 8;
export const AUTH_PASSWORD_MAX_LENGTH = 128;

type JwtUserPayload = {
  id: string;
  email: string;
  displayName: string | null;
  accountId: string;
  role: UserRole;
  approvalStatus: UserApprovalStatus;
};

export type VerifiedAppJwtPayload = {
  sub: string;
  email: string;
  name: string | null;
  accountId: string;
  role?: UserRole;
  approvalStatus?: UserApprovalStatus;
  exp: number;
};

type AuthResponseUserInput = JwtUserPayload;

function toBase64Url(input: string | Buffer): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function fromBase64Url(value: string): Buffer {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  return Buffer.from(padded, 'base64');
}

export function createAppJwt(user: JwtUserPayload, secret: string): string {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const header = { alg: 'HS256', typ: 'JWT' } as const;
  const body = {
    iat: nowSeconds,
    exp: nowSeconds + 60 * 60 * 24 * 7,
    sub: user.id,
    email: user.email,
    name: user.displayName,
    accountId: user.accountId,
    role: user.role,
    approvalStatus: user.approvalStatus
  };

  const encodedHeader = toBase64Url(JSON.stringify(header));
  const encodedPayload = toBase64Url(JSON.stringify(body));
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signature = crypto.createHmac('sha256', secret).update(signingInput).digest();
  return `${signingInput}.${toBase64Url(signature)}`;
}

export function verifyAppJwt(token: string, secret: string): VerifiedAppJwtPayload | null {
  try {
    const [headerPart, payloadPart, signaturePart] = token.split('.');
    if (!headerPart || !payloadPart || !signaturePart) {
      return null;
    }

    const signingInput = `${headerPart}.${payloadPart}`;
    const expected = crypto.createHmac('sha256', secret).update(signingInput).digest();
    const signature = fromBase64Url(signaturePart);
    if (expected.length !== signature.length || !crypto.timingSafeEqual(expected, signature)) {
      return null;
    }

    const payload = JSON.parse(fromBase64Url(payloadPart).toString('utf8')) as {
      sub?: string;
      email?: string;
      name?: string | null;
      accountId?: string;
      role?: UserRole;
      approvalStatus?: UserApprovalStatus;
      exp?: number;
    };

    if (!payload?.sub || !payload?.email || typeof payload.exp !== 'number') {
      return null;
    }
    if (payload.exp * 1000 <= Date.now()) {
      return null;
    }

    return {
      sub: payload.sub,
      email: payload.email,
      name: typeof payload.name === 'string' ? payload.name : null,
      accountId: resolveAccountId(payload.accountId, payload.email),
      role: payload.role,
      approvalStatus: payload.approvalStatus,
      exp: payload.exp
    };
  } catch {
    return null;
  }
}

export function hashPassword(password: string): { hash: string; salt: string } {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { hash, salt };
}

export function verifyPassword(password: string, hash: string, salt: string): boolean {
  const derived = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, 'hex');
  return derived.length === expected.length && crypto.timingSafeEqual(derived, expected);
}

export function toAuthResponseUser(user: AuthResponseUserInput) {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    accountId: user.accountId,
    role: user.role,
    approvalStatus: user.approvalStatus
  };
}
