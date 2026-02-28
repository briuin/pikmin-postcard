import { NextResponse } from 'next/server';
import { FeedbackAction, Prisma } from '@prisma/client';
import { z } from 'zod';
import { getAuthenticatedUserId } from '@/lib/api-auth';
import { toViewerFeedback } from '@/lib/postcards/feedback';
import { prisma } from '@/lib/prisma';

const feedbackSchema = z.object({
  action: z.enum(['like', 'dislike', 'report_wrong_location'])
});

type RouteContext = {
  params: Promise<{ id: string }>;
};

type FeedbackResult = 'added' | 'removed' | 'switched' | 'already_reported';

function toFeedbackAction(action: 'like' | 'dislike' | 'report_wrong_location'): FeedbackAction {
  if (action === 'like') {
    return FeedbackAction.LIKE;
  }
  if (action === 'dislike') {
    return FeedbackAction.DISLIKE;
  }
  return FeedbackAction.REPORT_WRONG_LOCATION;
}

async function incrementActionCount(
  tx: Prisma.TransactionClient,
  postcardId: string,
  action: FeedbackAction
): Promise<void> {
  if (action === FeedbackAction.LIKE) {
    await tx.postcard.update({
      where: { id: postcardId },
      data: { likeCount: { increment: 1 } }
    });
    return;
  }

  if (action === FeedbackAction.DISLIKE) {
    await tx.postcard.update({
      where: { id: postcardId },
      data: { dislikeCount: { increment: 1 } }
    });
    return;
  }

  await tx.postcard.update({
    where: { id: postcardId },
    data: { wrongLocationReports: { increment: 1 } }
  });
}

async function decrementActionCount(
  tx: Prisma.TransactionClient,
  postcardId: string,
  action: FeedbackAction
): Promise<void> {
  if (action === FeedbackAction.LIKE) {
    await tx.postcard.update({
      where: { id: postcardId },
      data: { likeCount: { decrement: 1 } }
    });
    return;
  }

  if (action === FeedbackAction.DISLIKE) {
    await tx.postcard.update({
      where: { id: postcardId },
      data: { dislikeCount: { decrement: 1 } }
    });
    return;
  }

  await tx.postcard.update({
    where: { id: postcardId },
    data: { wrongLocationReports: { decrement: 1 } }
  });
}

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
    const action = toFeedbackAction(body.action);

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

      let result: FeedbackResult = 'added';
      if (action === FeedbackAction.REPORT_WRONG_LOCATION) {
        try {
          await tx.postcardFeedback.create({
            data: {
              postcardId: id,
              userId,
              action
            }
          });
          await incrementActionCount(tx, id, action);
        } catch (error) {
          if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
            result = 'already_reported';
          } else {
            throw error;
          }
        }
      } else {
        const existingVotes = await tx.postcardFeedback.findMany({
          where: {
            postcardId: id,
            userId,
            action: {
              in: [FeedbackAction.LIKE, FeedbackAction.DISLIKE]
            }
          },
          select: {
            id: true,
            action: true
          }
        });

        const sameVote = existingVotes.find((item) => item.action === action);
        const oppositeVote = existingVotes.find((item) => item.action !== action);

        if (sameVote) {
          await tx.postcardFeedback.delete({
            where: {
              id: sameVote.id
            }
          });
          await decrementActionCount(tx, id, action);
          result = 'removed';
        } else {
          if (oppositeVote) {
            await tx.postcardFeedback.delete({
              where: {
                id: oppositeVote.id
              }
            });
            await decrementActionCount(tx, id, oppositeVote.action);
            result = 'switched';
          }

          await tx.postcardFeedback.create({
            data: {
              postcardId: id,
              userId,
              action
            }
          });
          await incrementActionCount(tx, id, action);
        }
      }

      const counts = await tx.postcard.findUnique({
        where: { id },
        select: {
          id: true,
          likeCount: true,
          dislikeCount: true,
          wrongLocationReports: true
        }
      });

      if (!counts) {
        return null;
      }

      const feedbackRows = await tx.postcardFeedback.findMany({
        where: {
          postcardId: id,
          userId
        },
        select: {
          action: true
        }
      });

      return {
        ...counts,
        result,
        action: body.action,
        viewerFeedback: toViewerFeedback(feedbackRows.map((item) => item.action))
      };
    });

    if (!postcard) {
      return NextResponse.json({ error: 'Postcard not found.' }, { status: 404 });
    }

    return NextResponse.json(postcard, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Failed to submit feedback.',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 400 }
    );
  }
}
