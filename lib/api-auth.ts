import crypto from 'node:crypto';
import { headers } from 'next/headers';
import { auth } from '@/auth';
import type { Prisma } from '@prisma/client';
import { UserApprovalStatus, UserRole } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { defaultApprovalStatusForRole, isApprovedStatus } from '@/lib/user-approval';
import { normalizeEmail, roleForEmail } from '@/lib/user-role';

type UserIdOptions = {
  createIfMissing?: boolean;
};

type AuthenticatedIdentity = {
  userId?: string;
  email: string;
  name: string | null;
};

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

const authenticatedUserSelect = {
  id: true,
  email: true,
  role: true,
  approvalStatus: true,
  canCreatePostcard: true,
  canSubmitDetection: true,
  canVote: true
} as const;

type AuthenticatedUserRecord = Prisma.UserGetPayload<{
  select: typeof authenticatedUserSelect;
}>;

function getDefaultUserAuthValues(email: string) {
  const defaultRole = roleForEmail(email);
  const defaultApprovalStatus = defaultApprovalStatusForRole(defaultRole);
  return {
    defaultRole,
    defaultApprovalStatus
  };
}

function buildUserUpsertData(params: {
  normalizedEmail: string;
  displayName: string | null;
  defaultRole: UserRole;
  defaultApprovalStatus: UserApprovalStatus;
}) {
  return {
    where: { email: params.normalizedEmail },
    update:
      params.defaultRole === UserRole.ADMIN
        ? { role: UserRole.ADMIN, approvalStatus: UserApprovalStatus.APPROVED }
        : {},
    create: {
      email: params.normalizedEmail,
      displayName: params.displayName,
      role: params.defaultRole,
      approvalStatus: params.defaultApprovalStatus
    }
  };
}

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

async function getBearerIdentity(): Promise<AuthenticatedIdentity | null> {
  const secret = (process.env.APP_JWT_SECRET ?? '').trim();
  if (!secret) {
    return null;
  }

  const requestHeaders = await headers();
  const token = parseBearerTokenFromAuthorization(requestHeaders.get('authorization'));
  if (!token) {
    return null;
  }

  const payload = verifyBearerToken(token, secret);
  if (!payload) {
    return null;
  }

  return {
    userId: payload.sub,
    email: normalizeEmail(payload.email),
    name: payload.name ?? null
  };
}

function toAuthenticatedUser(
  user: NonNullable<AuthenticatedUserRecord>,
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
  const bearerIdentity = await getBearerIdentity();
  if (bearerIdentity?.email) {
    return bearerIdentity.email;
  }

  const session = await auth();
  const userEmail = session?.user?.email;
  if (!userEmail) {
    return null;
  }

  return userEmail;
}

export async function getAuthenticatedIdentity(): Promise<AuthenticatedIdentity | null> {
  const bearerIdentity = await getBearerIdentity();
  if (bearerIdentity?.email) {
    return bearerIdentity;
  }

  const session = await auth();
  const userEmail = session?.user?.email;
  if (!userEmail) {
    return null;
  }

  const normalizedName = session.user?.name?.trim();
  return {
    email: userEmail,
    name: normalizedName && normalizedName.length > 0 ? normalizedName : null
  };
}

export async function getUserIdByEmail(
  email: string,
  options: UserIdOptions & { defaultDisplayName?: string | null } = {}
): Promise<string | null> {
  const normalizedEmail = normalizeEmail(email);
  const displayName = options.defaultDisplayName?.trim();
  const { defaultRole, defaultApprovalStatus } = getDefaultUserAuthValues(normalizedEmail);

  if (options.createIfMissing) {
    const user = await prisma.user.upsert(
      buildUserUpsertData({
        normalizedEmail,
        displayName: displayName && displayName.length > 0 ? displayName : null,
        defaultRole,
        defaultApprovalStatus
      })
    );
    return user.id;
  }

  const user = await prisma.user.findUnique({
    where: { email: normalizedEmail },
    select: { id: true }
  });

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

    const existingById = await prisma.user.findUnique({
      where: { id: identity.userId },
      select: { id: true }
    });
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
  const { defaultRole, defaultApprovalStatus } = getDefaultUserAuthValues(normalizedEmail);

  if (options.createIfMissing) {
    const user = await prisma.user.upsert({
      ...buildUserUpsertData({
        normalizedEmail,
        displayName: identity.name,
        defaultRole,
        defaultApprovalStatus
      }),
      select: authenticatedUserSelect
    });

    return toAuthenticatedUser(user, identity.name);
  }

  const user = await prisma.user.findUnique({
    where: { email: normalizedEmail },
    select: authenticatedUserSelect
  });

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
