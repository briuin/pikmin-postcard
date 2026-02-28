import { UserRole } from '@prisma/client';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getAuthenticatedUser, isAdminRole } from '@/lib/api-auth';
import { roleForEmail } from '@/lib/user-role';
import { prisma } from '@/lib/prisma';

const updateUserRoleSchema = z.object({
  userId: z.string().min(1),
  role: z.nativeEnum(UserRole)
});

export async function GET() {
  const actor = await getAuthenticatedUser({ createIfMissing: true });
  if (!actor) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }
  if (!isAdminRole(actor.role)) {
    return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
  }

  const users = await prisma.user.findMany({
    orderBy: [{ role: 'desc' }, { createdAt: 'desc' }],
    select: {
      id: true,
      email: true,
      displayName: true,
      role: true,
      createdAt: true,
      _count: {
        select: {
          postcards: true
        }
      }
    },
    take: 500
  });

  return NextResponse.json(
    users.map((user) => ({
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
      createdAt: user.createdAt,
      postcardCount: user._count.postcards
    })),
    { status: 200 }
  );
}

export async function PATCH(request: Request) {
  const actor = await getAuthenticatedUser({ createIfMissing: true });
  if (!actor) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }
  if (!isAdminRole(actor.role)) {
    return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
  }

  try {
    const payload = updateUserRoleSchema.parse(await request.json());
    const target = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { id: true, email: true, role: true }
    });

    if (!target) {
      return NextResponse.json({ error: 'User not found.' }, { status: 404 });
    }

    if (roleForEmail(target.email) === UserRole.ADMIN && payload.role !== UserRole.ADMIN) {
      return NextResponse.json(
        { error: 'Default bootstrap admin account must remain ADMIN.' },
        { status: 400 }
      );
    }

    const updated = await prisma.user.update({
      where: { id: payload.userId },
      data: { role: payload.role },
      select: {
        id: true,
        email: true,
        displayName: true,
        role: true,
        createdAt: true
      }
    });

    return NextResponse.json(updated, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Failed to update user role.',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 400 }
    );
  }
}
