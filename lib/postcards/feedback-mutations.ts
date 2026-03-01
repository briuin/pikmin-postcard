import { FeedbackAction, PostcardReportReason, PostcardReportStatus, Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { toViewerFeedback, type ViewerFeedback } from '@/lib/postcards/feedback';

export type FeedbackInputAction =
  | 'like'
  | 'dislike'
  | 'favorite'
  | 'collected'
  | 'report'
  | 'report_wrong_location';
export type FeedbackResult = 'added' | 'removed' | 'switched' | 'already_reported';
export type FeedbackReportReasonInput =
  | 'wrong_location'
  | 'spam'
  | 'illegal_image'
  | 'other';

export type FeedbackMutationResult = {
  id: string;
  likeCount: number;
  dislikeCount: number;
  wrongLocationReports: number;
  result: FeedbackResult;
  action: 'like' | 'dislike' | 'favorite' | 'collected' | 'report';
  viewerFeedback: ViewerFeedback;
};

function toToggleFeedbackAction(action: FeedbackInputAction): FeedbackAction {
  if (action === 'like') {
    return FeedbackAction.LIKE;
  }
  if (action === 'favorite') {
    return FeedbackAction.FAVORITE;
  }
  if (action === 'collected') {
    return FeedbackAction.COLLECTED;
  }
  return FeedbackAction.DISLIKE;
}

function toReportReason(reason: FeedbackReportReasonInput): PostcardReportReason {
  if (reason === 'spam') {
    return PostcardReportReason.SPAM;
  }
  if (reason === 'illegal_image') {
    return PostcardReportReason.ILLEGAL_IMAGE;
  }
  if (reason === 'other') {
    return PostcardReportReason.OTHER;
  }
  return PostcardReportReason.WRONG_LOCATION;
}

async function loadViewerFeedback(
  tx: Prisma.TransactionClient,
  params: {
    postcardId: string;
    userId: string;
    reportVersion: number;
  }
): Promise<ViewerFeedback> {
  const [voteRows, reportRow] = await Promise.all([
    tx.postcardFeedback.findMany({
      where: {
        postcardId: params.postcardId,
        userId: params.userId,
        action: {
          in: [FeedbackAction.LIKE, FeedbackAction.DISLIKE, FeedbackAction.FAVORITE, FeedbackAction.COLLECTED]
        }
      },
      select: {
        action: true
      }
    }),
    tx.postcardReport.findFirst({
      where: {
        postcardId: params.postcardId,
        reporterUserId: params.userId,
        version: params.reportVersion
      },
      select: {
        id: true
      }
    })
  ]);

  const viewerFeedback = toViewerFeedback(voteRows.map((row) => row.action));
  return {
    ...viewerFeedback,
    reportedWrongLocation: Boolean(reportRow)
  };
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
  reportReason?: FeedbackReportReasonInput;
  reportDescription?: string | null;
}): Promise<FeedbackMutationResult | null> {
  return prisma.$transaction(async (tx) => {
    const postcard = await tx.postcard.findFirst({
      where: {
        id: params.postcardId,
        deletedAt: null
      },
      select: {
        id: true,
        reportVersion: true
      }
    });

    if (!postcard) {
      return null;
    }

    let result: FeedbackResult = 'added';
    if (params.action === 'report' || params.action === 'report_wrong_location') {
      const reason = toReportReason(params.reportReason ?? 'wrong_location');
      const normalizedDescription =
        typeof params.reportDescription === 'string'
          ? params.reportDescription.trim() || null
          : null;

      const reportCase = await tx.postcardReportCase.upsert({
        where: {
          postcardId_version: {
            postcardId: params.postcardId,
            version: postcard.reportVersion
          }
        },
        create: {
          postcardId: params.postcardId,
          version: postcard.reportVersion,
          status: PostcardReportStatus.PENDING
        },
        update: {},
        select: {
          id: true
        }
      });

      try {
        await tx.postcardReport.create({
          data: {
            postcardId: params.postcardId,
            version: postcard.reportVersion,
            caseId: reportCase.id,
            reporterUserId: params.userId,
            reason,
            description: normalizedDescription
          }
        });
        await tx.postcard.update({
          where: { id: params.postcardId },
          data: {
            wrongLocationReports: {
              increment: 1
            }
          }
        });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          result = 'already_reported';
        } else {
          throw error;
        }
      }
    } else {
      const action = toToggleFeedbackAction(params.action);
      const existingFeedbackRows = await tx.postcardFeedback.findMany({
        where: {
          postcardId: params.postcardId,
          userId: params.userId,
          action: {
            in: [FeedbackAction.LIKE, FeedbackAction.DISLIKE, FeedbackAction.FAVORITE, FeedbackAction.COLLECTED]
          }
        },
        select: {
          id: true,
          action: true
        }
      });

      if (action === FeedbackAction.LIKE || action === FeedbackAction.DISLIKE) {
        const sameVote = existingFeedbackRows.find((item) => item.action === action);
        const oppositeVote = existingFeedbackRows.find(
          (item) =>
            item.action !== action &&
            (item.action === FeedbackAction.LIKE || item.action === FeedbackAction.DISLIKE)
        );

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
      } else {
        const sameAction = existingFeedbackRows.find((item) => item.action === action);

        if (sameAction) {
          await tx.postcardFeedback.delete({
            where: {
              id: sameAction.id
            }
          });
          result = 'removed';
        } else {
          await tx.postcardFeedback.create({
            data: {
              postcardId: params.postcardId,
              userId: params.userId,
              action
            }
          });
        }
      }
    }

    const counts = await tx.postcard.findUnique({
      where: { id: params.postcardId },
      select: {
        id: true,
        likeCount: true,
        dislikeCount: true,
        wrongLocationReports: true,
        reportVersion: true
      }
    });

    if (!counts) {
      return null;
    }

    const viewerFeedback = await loadViewerFeedback(tx, {
      postcardId: params.postcardId,
      userId: params.userId,
      reportVersion: counts.reportVersion
    });

    return {
      id: counts.id,
      likeCount: counts.likeCount,
      dislikeCount: counts.dislikeCount,
      wrongLocationReports: counts.wrongLocationReports,
      result,
      action:
        params.action === 'report' || params.action === 'report_wrong_location'
          ? 'report'
          : params.action,
      viewerFeedback
    };
  });
}
