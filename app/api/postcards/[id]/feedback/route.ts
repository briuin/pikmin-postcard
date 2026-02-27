import { NextResponse } from 'next/server';
import { FeedbackAction, Prisma } from '@prisma/client';
import { z } from 'zod';
import { getAuthenticatedUserId } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';

const feedbackSchema = z.object({
  action: z.enum(['like', 'dislike', 'report_wrong_location'])
});

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const userId = await getAuthenticatedUserId({ createIfMissing: true });
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  const { id } = await context.params;
  if (!id) {
    return NextResponse.json({ error: 'Missing postcard id.' }, { status: 400 });
  }

  try {
    const body = feedbackSchema.parse(await request.json());

    const action =
      body.action === 'like'
        ? FeedbackAction.LIKE
        : body.action === 'dislike'
          ? FeedbackAction.DISLIKE
          : FeedbackAction.REPORT_WRONG_LOCATION;

    const updateData =
      body.action === 'like'
        ? { likeCount: { increment: 1 } }
        : body.action === 'dislike'
          ? { dislikeCount: { increment: 1 } }
          : { wrongLocationReports: { increment: 1 } };

    const postcard = await prisma.$transaction(async (tx) => {
      const exists = await tx.postcard.findFirst({
        where: {
          id,
          deletedAt: null
        },
        select: { id: true }
      });

      if (!exists) {
        return null;
      }

      await tx.postcardFeedback.create({
        data: {
          postcardId: id,
          userId,
          action
        }
      });

      return tx.postcard.update({
        where: { id },
        data: updateData,
        select: {
          id: true,
          likeCount: true,
          dislikeCount: true,
          wrongLocationReports: true
        }
      });
    });

    if (!postcard) {
      return NextResponse.json({ error: 'Postcard not found.' }, { status: 404 });
    }

    return NextResponse.json(postcard, { status: 200 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return NextResponse.json(
        {
          error: 'You have already submitted this feedback action for this postcard.'
        },
        { status: 409 }
      );
    }

    return NextResponse.json(
      {
        error: 'Failed to submit feedback.',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 400 }
    );
  }
}
