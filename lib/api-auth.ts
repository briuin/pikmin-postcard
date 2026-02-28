import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

type UserIdOptions = {
  createIfMissing?: boolean;
};

type AuthenticatedIdentity = {
  email: string;
  name: string | null;
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
  const displayName = options.defaultDisplayName?.trim();

  if (options.createIfMissing) {
    const user = await prisma.user.upsert({
      where: { email },
      update: {},
      create: {
        email,
        displayName: displayName && displayName.length > 0 ? displayName : null
      }
    });
    return user.id;
  }

  const user = await prisma.user.findUnique({
    where: { email },
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
