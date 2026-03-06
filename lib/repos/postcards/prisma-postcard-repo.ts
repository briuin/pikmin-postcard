import {
  FeedbackAction,
  PostcardEditAction,
  PostcardReportReason,
  PostcardReportStatus,
  Prisma
} from '@prisma/client';
import { prisma } from '@/lib/prisma';
import {
  postcardEditSelect,
  toEditSnapshot,
  type EditablePostcard
} from '@/lib/postcards/edit-history';
import {
  postcardListSelectWithOriginalImageUrl,
  postcardListSelectWithoutOriginalImageUrl
} from '@/lib/postcards/list';
import { hasMissingOriginalImageColumnError } from '@/lib/postcards/shared';
import { toViewerFeedback } from '@/lib/postcards/viewer-feedback';
import type {
  CreatePostcardInput,
  CropBox,
  PostcardFeedbackRow,
  PostcardCropSource,
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

type EditableWhere = {
  postcardId: string;
  actorId: string;
  canEditAny: boolean;
};

function buildEditableWhere({ postcardId, actorId, canEditAny }: EditableWhere): Prisma.PostcardWhereInput {
  return {
    id: postcardId,
    ...(canEditAny ? {} : { userId: actorId }),
    deletedAt: null
  };
}

async function findEditablePostcardBefore(
  tx: Prisma.TransactionClient,
  params: EditableWhere
): Promise<EditablePostcard | null> {
  return tx.postcard.findFirst({
    where: buildEditableWhere(params),
    select: postcardEditSelect
  });
}

async function withEditablePostcard(
  tx: Prisma.TransactionClient,
  params: EditableWhere,
  run: (before: EditablePostcard) => Promise<EditablePostcard>
): Promise<EditablePostcard | null> {
  const before = await findEditablePostcardBefore(tx, params);
  if (!before) {
    return null;
  }

  return run(before);
}

async function recordPostcardEditHistory(params: {
  tx: Prisma.TransactionClient;
  postcardId: string;
  actorId: string;
  action: PostcardEditAction;
  before: EditablePostcard;
  afterData: Prisma.InputJsonValue;
}) {
  await params.tx.postcardEditHistory.create({
    data: {
      postcardId: params.postcardId,
      userId: params.actorId,
      action: params.action,
      beforeData: toEditSnapshot(params.before),
      afterData: params.afterData
    }
  });
}

async function updatePostcardWithHistory(params: {
  tx: Prisma.TransactionClient;
  postcardId: string;
  actorId: string;
  before: EditablePostcard;
  action: PostcardEditAction;
  updateData: Prisma.PostcardUpdateInput;
  toAfterData?: (after: EditablePostcard) => Prisma.InputJsonValue;
}): Promise<EditablePostcard> {
  const after = await params.tx.postcard.update({
    where: { id: params.postcardId },
    data: params.updateData,
    select: postcardEditSelect
  });

  await recordPostcardEditHistory({
    tx: params.tx,
    postcardId: params.postcardId,
    actorId: params.actorId,
    action: params.action,
    before: params.before,
    afterData: params.toAfterData ? params.toAfterData(after) : toEditSnapshot(after)
  });

  return after;
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

async function create(input: CreatePostcardInput): Promise<Record<string, unknown>> {
  const baseData = {
    userId: input.userId,
    title: input.title,
    postcardType: input.postcardType,
    notes: input.notes ?? undefined,
    imageUrl: input.imageUrl ?? undefined,
    city: input.city ?? undefined,
    state: input.state ?? undefined,
    country: input.country ?? undefined,
    placeName: input.placeName ?? undefined,
    latitude: input.latitude ?? undefined,
    longitude: input.longitude ?? undefined,
    aiLatitude: input.aiLatitude ?? undefined,
    aiLongitude: input.aiLongitude ?? undefined,
    aiConfidence: input.aiConfidence ?? undefined,
    aiPlaceGuess: input.aiPlaceGuess ?? undefined,
    locationStatus: input.locationStatus ?? undefined,
    locationModelVersion: input.locationModelVersion ?? undefined
  };

  try {
    const created = await prisma.postcard.create({
      data: {
        ...baseData,
        originalImageUrl: input.originalImageUrl ?? undefined
      }
    });
    return created as unknown as Record<string, unknown>;
  } catch (error) {
    if (!hasMissingOriginalImageColumnError(error)) {
      throw error;
    }

    const created = await prisma.postcard.create({
      data: baseData
    });
    return created as unknown as Record<string, unknown>;
  }
}

async function findCropSource(params: {
  postcardId: string;
  userId?: string;
}): Promise<PostcardCropSource | null> {
  const ownershipFilter = params.userId ? { userId: params.userId } : {};

  try {
    return await prisma.postcard.findFirst({
      where: {
        id: params.postcardId,
        ...ownershipFilter,
        deletedAt: null
      },
      select: {
        id: true,
        imageUrl: true,
        originalImageUrl: true
      }
    });
  } catch (error) {
    if (!hasMissingOriginalImageColumnError(error)) {
      throw error;
    }

    const fallback = await prisma.postcard.findFirst({
      where: {
        id: params.postcardId,
        ...ownershipFilter,
        deletedAt: null
      },
      select: {
        id: true,
        imageUrl: true
      }
    });

    return fallback ? { ...fallback, originalImageUrl: null } : null;
  }
}

async function findEditableForActor(params: {
  postcardId: string;
  actorId: string;
  canEditAny: boolean;
}): Promise<EditablePostcard | null> {
  return prisma.postcard.findFirst({
    where: buildEditableWhere(params),
    select: postcardEditSelect
  });
}

async function applyCropUpdateWithHistory(params: {
  postcardId: string;
  actorId: string;
  canEditAny: boolean;
  imageUrl: string;
  originalImageUrl?: string | null;
  crop: CropBox;
}): Promise<{ imageUrl: string | null; originalImageUrl: string | null } | null> {
  const updated = await prisma.$transaction(async (tx) => {
    return withEditablePostcard(
      tx,
      {
        postcardId: params.postcardId,
        actorId: params.actorId,
        canEditAny: params.canEditAny
      },
      async (before) => {
        const updateData: Prisma.PostcardUpdateInput = {
          imageUrl: params.imageUrl
        };
        if (params.originalImageUrl) {
          updateData.originalImageUrl = params.originalImageUrl;
        }

        const after = await updatePostcardWithHistory({
          tx,
          postcardId: params.postcardId,
          actorId: params.actorId,
          before,
          action: PostcardEditAction.CROP_UPDATED,
          updateData,
          toAfterData: (afterPostcard) => ({
            ...toEditSnapshot(afterPostcard),
            crop: params.crop
          })
        });

        return after;
      }
    );
  });

  if (!updated) {
    return null;
  }

  return {
    imageUrl: updated.imageUrl,
    originalImageUrl: updated.originalImageUrl ?? null
  };
}

async function applyDetailsUpdateWithHistory(params: {
  postcardId: string;
  actorId: string;
  canEditAny: boolean;
  updateData: Prisma.PostcardUpdateInput;
}): Promise<EditablePostcard | null> {
  return prisma.$transaction(async (tx) => {
    return withEditablePostcard(
      tx,
      {
        postcardId: params.postcardId,
        actorId: params.actorId,
        canEditAny: params.canEditAny
      },
      async (before) =>
        updatePostcardWithHistory({
          tx,
          postcardId: params.postcardId,
          actorId: params.actorId,
          before,
          action: PostcardEditAction.DETAILS_UPDATED,
          updateData: params.updateData
        })
    );
  });
}

async function softDeleteWithHistory(params: {
  postcardId: string;
  actorId: string;
  deletedAt: Date;
}): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const before = await tx.postcard.findFirst({
      where: {
        id: params.postcardId,
        userId: params.actorId,
        deletedAt: null
      },
      select: postcardEditSelect
    });

    if (!before) {
      return false;
    }

    const after = await tx.postcard.update({
      where: { id: params.postcardId },
      data: {
        deletedAt: params.deletedAt
      },
      select: postcardEditSelect
    });

    await tx.postcardEditHistory.create({
      data: {
        postcardId: params.postcardId,
        userId: params.actorId,
        action: PostcardEditAction.SOFT_DELETED,
        beforeData: toEditSnapshot(before),
        afterData: toEditSnapshot(after)
      }
    });

    return true;
  });
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
  create,
  findCropSource,
  findEditableForActor,
  applyCropUpdateWithHistory,
  applyDetailsUpdateWithHistory,
  softDeleteWithHistory,
  findSavedPostcardIdsByUser,
  findViewerFeedbackRowsForPostcards,
  submitFeedback
};
