import { auth } from '@/auth';
import { UserRole } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { normalizeEmail, roleForEmail } from '@/lib/user-role';

type UserIdOptions = {
  createIfMissing?: boolean;
};

type AuthenticatedIdentity = {
  email: string;
  name: string | null;
};

type AuthenticatedUser = {
  id: string;
  email: string;
  name: string | null;
  role: UserRole;
};

export async function getAuthenticatedUserEmail(): Promise<string | null> {
  const session = await auth();
  const userEmail = session?.user?.email;
  if (!userEmail) {
    return null;
  }

  return userEmail;
}

export async function getAuthenticatedIdentity(): Promise<AuthenticatedIdentity | null> {
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
  const defaultRole = roleForEmail(normalizedEmail);

  if (options.createIfMissing) {
    const user = await prisma.user.upsert({
      where: { email: normalizedEmail },
      update: defaultRole === UserRole.ADMIN ? { role: UserRole.ADMIN } : {},
      create: {
        email: normalizedEmail,
        displayName: displayName && displayName.length > 0 ? displayName : null,
        role: defaultRole
      }
    });
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
  const defaultRole = roleForEmail(normalizedEmail);

  if (options.createIfMissing) {
    const user = await prisma.user.upsert({
      where: { email: normalizedEmail },
      update: defaultRole === UserRole.ADMIN ? { role: UserRole.ADMIN } : {},
      create: {
        email: normalizedEmail,
        displayName: identity.name,
        role: defaultRole
      },
      select: {
        id: true,
        email: true,
        role: true
      }
    });

    return {
      id: user.id,
      email: user.email,
      role: user.role,
      name: identity.name
    };
  }

  const user = await prisma.user.findUnique({
    where: { email: normalizedEmail },
    select: {
      id: true,
      email: true,
      role: true
    }
  });

  if (!user) {
    return null;
  }

  return {
    id: user.id,
    email: user.email,
    role: user.role,
    name: identity.name
  };
}

export { isAdminRole, isManagerOrAboveRole } from '@/lib/user-role';
