import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getAuthenticatedUserId } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';

const feedbackCreateSchema = z.object({
  subject: z.string().trim().min(2).max(120),
  message: z.string().trim().min(10).max(5000)
});

export async function POST(request: Request) {
  const userId = await getAuthenticatedUserId({ createIfMissing: true });
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  try {
    const body = feedbackCreateSchema.parse(await request.json());
    const created = await prisma.feedbackMessage.create({
      data: {
        userId,
        subject: body.subject,
        message: body.message
      },
      select: {
        id: true,
        subject: true,
        message: true,
        status: true,
        createdAt: true
      }
    });
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Invalid feedback payload.',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 400 }
    );
  }
}
