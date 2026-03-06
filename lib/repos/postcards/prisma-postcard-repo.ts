import {
  FeedbackAction,
  PostcardReportReason,
  PostcardReportStatus,
  Prisma
} from '@prisma/client';
import { prisma } from '@/lib/prisma';
import {
  postcardListSelectWithOriginalImageUrl,
  postcardListSelectWithoutOriginalImageUrl
} from '@/lib/postcards/list';
import { hasMissingOriginalImageColumnError } from '@/lib/postcards/shared';
import { toViewerFeedback } from '@/lib/postcards/viewer-feedback';
import type {
  PostcardFeedbackRow,
  PostcardRepo,
  SubmitPostcardFeedbackInput,
  SubmitPostcardFeedbackResult
} from '@/lib/repos/postcards/types';

function toToggleFeedbackAction(action: SubmitPostcardFeedbackInput['action']): FeedbackAction {
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

async function loadViewerFeedback(
  tx: Prisma.TransactionClient,
  params: {
    postcardId: string;
    userId: string;
    reportVersion: number;
  }
) {
  const [voteRows, reportRow] = await Promise.all([
    tx.postcardFeedback.findMany({
      where: {
        postcardId: params.postcardId,
        userId: params.userId,
        action: {
          in: [
            FeedbackAction.LIKE,
            FeedbackAction.DISLIKE,
            FeedbackAction.FAVORITE,
            FeedbackAction.COLLECTED
          ]
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

async function submitFeedback(
  params: SubmitPostcardFeedbackInput
): Promise<SubmitPostcardFeedbackResult | null> {
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

    let result: SubmitPostcardFeedbackResult['result'] = 'added';
    if (params.action === 'report') {
      const reason = params.reportReason ?? PostcardReportReason.WRONG_LOCATION;
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
            in: [
              FeedbackAction.LIKE,
              FeedbackAction.DISLIKE,
              FeedbackAction.FAVORITE,
              FeedbackAction.COLLECTED
            ]
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
      action: params.action,
      viewerFeedback
    };
  });
}

async function findForList(
  args: Omit<Prisma.PostcardFindManyArgs, 'select'>
) {
  try {
    return await prisma.postcard.findMany({
      ...args,
      select: postcardListSelectWithOriginalImageUrl
    });
  } catch (error) {
    if (!hasMissingOriginalImageColumnError(error)) {
      throw error;
    }

    return prisma.postcard.findMany({
      ...args,
      select: postcardListSelectWithoutOriginalImageUrl
    });
  }
}

async function count(where: Prisma.PostcardWhereInput): Promise<number> {
  return prisma.postcard.count({ where });
}

async function findSavedPostcardIdsByUser(params: {
  userId: string;
  take: number;
}): Promise<string[]> {
  const rows = await prisma.postcardFeedback.findMany({
    where: {
      userId: params.userId,
      action: {
        in: [FeedbackAction.FAVORITE, FeedbackAction.COLLECTED]
      },
      postcard: {
        deletedAt: null
      }
    },
    select: {
      postcardId: true
    },
    orderBy: {
      createdAt: 'desc'
    },
    take: params.take
  });

  return Array.from(new Set(rows.map((row) => row.postcardId)));
}

async function findViewerFeedbackRowsForPostcards(params: {
  userId: string;
  postcardIds: string[];
}): Promise<PostcardFeedbackRow[]> {
  const ids = Array.from(new Set(params.postcardIds.map((id) => String(id))));
  if (ids.length === 0) {
    return [];
  }

  const [voteRows, postcards, reportRows] = await Promise.all([
    prisma.postcardFeedback.findMany({
      where: {
        userId: params.userId,
        action: {
          in: [
            FeedbackAction.LIKE,
            FeedbackAction.DISLIKE,
            FeedbackAction.FAVORITE,
            FeedbackAction.COLLECTED
          ]
        },
        postcardId: {
          in: ids
        }
      },
      select: {
        postcardId: true,
        action: true
      }
    }),
    prisma.postcard.findMany({
      where: {
        id: {
          in: ids
        }
      },
      select: {
        id: true,
        reportVersion: true
      }
    }),
    prisma.postcardReport.findMany({
      where: {
        reporterUserId: params.userId,
        postcardId: {
          in: ids
        }
      },
      select: {
        postcardId: true,
        version: true
      }
    })
  ]);

  const versionByPostcardId = new Map(postcards.map((postcard) => [postcard.id, postcard.reportVersion]));

  const reportFeedbackRows: PostcardFeedbackRow[] = reportRows
    .filter((reportRow) => versionByPostcardId.get(reportRow.postcardId) === reportRow.version)
    .map((reportRow) => ({
      postcardId: reportRow.postcardId,
      action: FeedbackAction.REPORT_WRONG_LOCATION
    }));

  return [...voteRows, ...reportFeedbackRows];
}

export const prismaPostcardRepo: PostcardRepo = {
  findForList,
  count,
  findSavedPostcardIdsByUser,
  findViewerFeedbackRowsForPostcards,
  submitFeedback
};
