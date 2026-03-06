import crypto from 'node:crypto';
import { headers } from 'next/headers';
import { UserApprovalStatus, UserRole } from '@prisma/client';
import { userRepo, type UserRepoRecord } from '@/lib/repos/users';
import { isApprovedStatus } from '@/lib/user-approval';
import { normalizeEmail, roleForEmail } from '@/lib/user-role';

type UserIdOptions = {
  createIfMissing?: boolean;
};

type AuthenticatedIdentity = {
  userId?: string;
  email: string;
  name: string | null;
};

type BearerIdentityResult =
  | { kind: 'absent' }
  | { kind: 'invalid' }
  | { kind: 'ok'; identity: AuthenticatedIdentity };

type AuthenticatedUser = {
  id: string;
  email: string;
  name: string | null;
  role: UserRole;
  approvalStatus: UserApprovalStatus;
  canCreatePostcard: boolean;
  canSubmitDetection: boolean;
  canVote: boolean;
};

function fromBase64Url(value: string): Buffer {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  return Buffer.from(padded, 'base64');
}

function parseBearerTokenFromAuthorization(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  const match = value.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

function verifyBearerToken(
  token: string,
  secret: string
): { sub: string; email: string; name?: string | null; exp: number } | null {
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
      exp: payload.exp
    };
  } catch {
    return null;
  }
}

async function getBearerIdentityResult(): Promise<BearerIdentityResult> {
  const secret = (process.env.APP_JWT_SECRET ?? '').trim();
  if (!secret) {
    return { kind: 'absent' };
  }

  const requestHeaders = await headers();
  const authorization = requestHeaders.get('authorization');
  const token = parseBearerTokenFromAuthorization(authorization);
  if (!token) {
    return { kind: 'absent' };
  }

  const payload = verifyBearerToken(token, secret);
  if (!payload) {
    return { kind: 'invalid' };
  }

  return {
    kind: 'ok',
    identity: {
      userId: payload.sub,
      email: normalizeEmail(payload.email),
      name: payload.name ?? null
    }
  };
}

function toAuthenticatedUser(
  user: UserRepoRecord,
  name: string | null
): AuthenticatedUser {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    approvalStatus: user.approvalStatus,
    canCreatePostcard: user.canCreatePostcard,
    canSubmitDetection: user.canSubmitDetection,
    canVote: user.canVote,
    name
  };
}

export async function getAuthenticatedUserEmail(): Promise<string | null> {
  const bearer = await getBearerIdentityResult();
  return bearer.kind === 'ok' ? bearer.identity.email : null;
}

export async function getAuthenticatedIdentity(): Promise<AuthenticatedIdentity | null> {
  const bearer = await getBearerIdentityResult();
  return bearer.kind === 'ok' ? bearer.identity : null;
}

export async function getUserIdByEmail(
  email: string,
  options: UserIdOptions & { defaultDisplayName?: string | null } = {}
): Promise<string | null> {
  const normalizedEmail = normalizeEmail(email);
  const displayName = options.defaultDisplayName?.trim();
  const forceAdmin = roleForEmail(normalizedEmail) === UserRole.ADMIN;

  if (options.createIfMissing) {
    const user = await userRepo.upsertByEmail({
      email: normalizedEmail,
      displayName: displayName && displayName.length > 0 ? displayName : null,
      forceAdmin
    });
    return user.id;
  }

  const user = await userRepo.findByEmail(normalizedEmail);

  return user?.id ?? null;
}

export async function getAuthenticatedUserId(options: UserIdOptions = {}): Promise<string | null> {
  const identity = await getAuthenticatedIdentity();
  if (!identity?.email) {
    return null;
  }

  if (identity.userId) {
    if (!options.createIfMissing) {
      return identity.userId;
    }

    const existingById = await userRepo.findById(identity.userId);
    if (existingById?.id) {
      return existingById.id;
    }
  }

  return getUserIdByEmail(identity.email, {
    ...options,
    defaultDisplayName: identity.name
  });
}

export async function getAuthenticatedUser(
  options: UserIdOptions = {}
): Promise<AuthenticatedUser | null> {
  const identity = await getAuthenticatedIdentity();
  if (!identity?.email) {
    return null;
  }

  const normalizedEmail = normalizeEmail(identity.email);
  const forceAdmin = roleForEmail(normalizedEmail) === UserRole.ADMIN;

  if (options.createIfMissing) {
    const user = await userRepo.upsertByEmail({
      email: normalizedEmail,
      displayName: identity.name,
      forceAdmin
    });

    return toAuthenticatedUser(user, identity.name);
  }

  const user = await userRepo.findByEmail(normalizedEmail);

  if (!user) {
    return null;
  }

  return toAuthenticatedUser(user, identity.name);
}

export function isApprovedUser(
  user: Pick<AuthenticatedUser, 'approvalStatus'>
): boolean {
  return isApprovedStatus(user.approvalStatus);
}

export { isAdminRole, isManagerOrAboveRole } from '@/lib/user-role';
