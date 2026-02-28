import { FeedbackAction, Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { toViewerFeedback, type ViewerFeedback } from '@/lib/postcards/feedback';

export type FeedbackInputAction = 'like' | 'dislike' | 'report_wrong_location';
export type FeedbackResult = 'added' | 'removed' | 'switched' | 'already_reported';

export type FeedbackMutationResult = {
  id: string;
  likeCount: number;
  dislikeCount: number;
  wrongLocationReports: number;
  result: FeedbackResult;
  action: FeedbackInputAction;
  viewerFeedback: ViewerFeedback;
};

function toFeedbackAction(action: FeedbackInputAction): FeedbackAction {
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
  await mutateActionCount(tx, postcardId, action, 'increment');
}

async function decrementActionCount(
  tx: Prisma.TransactionClient,
  postcardId: string,
  action: FeedbackAction
): Promise<void> {
  await mutateActionCount(tx, postcardId, action, 'decrement');
}

async function mutateActionCount(
  tx: Prisma.TransactionClient,
  postcardId: string,
  action: FeedbackAction,
  mode: 'increment' | 'decrement'
): Promise<void> {
  const amount = mode === 'increment' ? { increment: 1 } : { decrement: 1 };

  if (action === FeedbackAction.LIKE) {
    await tx.postcard.update({
      where: { id: postcardId },
      data: { likeCount: amount }
    });
    return;
  }

  if (action === FeedbackAction.DISLIKE) {
    await tx.postcard.update({
      where: { id: postcardId },
      data: { dislikeCount: amount }
    });
    return;
  }

  await tx.postcard.update({
    where: { id: postcardId },
    data: { wrongLocationReports: amount }
  });
}

export async function submitPostcardFeedback(params: {
  postcardId: string;
  userId: string;
  action: FeedbackInputAction;
}): Promise<FeedbackMutationResult | null> {
  const action = toFeedbackAction(params.action);

  return prisma.$transaction(async (tx) => {
    const exists = await tx.postcard.findFirst({
      where: {
        id: params.postcardId,
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
            postcardId: params.postcardId,
            userId: params.userId,
            action
          }
        });
        await incrementActionCount(tx, params.postcardId, action);
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
          postcardId: params.postcardId,
          userId: params.userId,
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
        await decrementActionCount(tx, params.postcardId, action);
        result = 'removed';
      } else {
        if (oppositeVote) {
          await tx.postcardFeedback.delete({
            where: {
              id: oppositeVote.id
            }
          });
          await decrementActionCount(tx, params.postcardId, oppositeVote.action);
          result = 'switched';
        }

        await tx.postcardFeedback.create({
          data: {
            postcardId: params.postcardId,
            userId: params.userId,
            action
          }
        });
        await incrementActionCount(tx, params.postcardId, action);
      }
    }

    const counts = await tx.postcard.findUnique({
      where: { id: params.postcardId },
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
        postcardId: params.postcardId,
        userId: params.userId
      },
      select: {
        action: true
      }
    });

    return {
      ...counts,
      result,
      action: params.action,
      viewerFeedback: toViewerFeedback(feedbackRows.map((item) => item.action))
    };
  });
}
