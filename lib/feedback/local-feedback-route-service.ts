import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { recordUserAction } from '@/lib/user-action-log';

const feedbackCreateSchema = z.object({
  subject: z.string().trim().min(2).max(120),
  message: z.string().trim().min(10).max(5000)
});

export async function createFeedbackLocal(args: {
  request: Request;
  actorId: string;
}): Promise<NextResponse> {
  const { request, actorId } = args;
  try {
    const body = feedbackCreateSchema.parse(await request.json());
    await recordUserAction({
      request,
      userId: actorId,
      action: 'FEEDBACK_SUBMIT',
      metadata: {
        subjectLength: body.subject.length,
        messageLength: body.message.length
      }
    });
    const created = await prisma.feedbackMessage.create({
      data: {
        userId: actorId,
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
