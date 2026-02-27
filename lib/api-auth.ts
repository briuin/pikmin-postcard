import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

type UserIdOptions = {
  createIfMissing?: boolean;
};

export async function getAuthenticatedUserEmail(): Promise<string | null> {
  const session = await auth();
  const userEmail = session?.user?.email;
  if (!userEmail) {
    return null;
  }

  return userEmail;
}

export async function getUserIdByEmail(email: string, options: UserIdOptions = {}): Promise<string | null> {
  if (options.createIfMissing) {
    const user = await prisma.user.upsert({
      where: { email },
      update: {},
      create: { email }
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
  const email = await getAuthenticatedUserEmail();
  if (!email) {
    return null;
  }

  return getUserIdByEmail(email, options);
}
