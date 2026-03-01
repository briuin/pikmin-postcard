import { FeedbackAction } from '@prisma/client';
import { prisma } from '@/lib/prisma';

export type ViewerFeedback = {
  liked: boolean;
  disliked: boolean;
  reportedWrongLocation: boolean;
  favorited: boolean;
  collected: boolean;
};

type FeedbackRow = {
  postcardId: string;
  action: FeedbackAction;
};

function emptyViewerFeedback(): ViewerFeedback {
  return {
    liked: false,
    disliked: false,
    reportedWrongLocation: false,
    favorited: false,
    collected: false
  };
}

export function toViewerFeedback(actions: Iterable<FeedbackAction>): ViewerFeedback {
  const set = new Set(actions);

  return {
    liked: set.has(FeedbackAction.LIKE),
    disliked: set.has(FeedbackAction.DISLIKE),
    reportedWrongLocation: set.has(FeedbackAction.REPORT_WRONG_LOCATION),
    favorited: set.has(FeedbackAction.FAVORITE),
    collected: set.has(FeedbackAction.COLLECTED)
  };
}

export async function findViewerFeedbackRowsForPostcards(
  userId: string | null | undefined,
  postcardIds: Array<string | number>
): Promise<FeedbackRow[]> {
  if (!userId || postcardIds.length === 0) {
    return [];
  }

  const ids = Array.from(new Set(postcardIds.map((id) => String(id))));
  const [voteRows, postcards, reportRows] = await Promise.all([
    prisma.postcardFeedback.findMany({
      where: {
        userId,
        action: {
          in: [FeedbackAction.LIKE, FeedbackAction.DISLIKE, FeedbackAction.FAVORITE, FeedbackAction.COLLECTED]
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
        reporterUserId: userId,
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

  const versionByPostcardId = new Map(
    postcards.map((postcard) => [postcard.id, postcard.reportVersion])
  );

  const reportFeedbackRows: FeedbackRow[] = reportRows
    .filter((reportRow) => versionByPostcardId.get(reportRow.postcardId) === reportRow.version)
    .map((reportRow) => ({
      postcardId: reportRow.postcardId,
      action: FeedbackAction.REPORT_WRONG_LOCATION
    }));

  return [...voteRows, ...reportFeedbackRows];
}

export function attachViewerFeedback<T extends { id: string | number }>(
  postcards: T[],
  feedbackRows: FeedbackRow[]
): Array<T & { viewerFeedback: ViewerFeedback }> {
  if (postcards.length === 0) {
    return [];
  }

  if (feedbackRows.length === 0) {
    return postcards.map((postcard) => ({
      ...postcard,
      viewerFeedback: emptyViewerFeedback()
    }));
  }

  const feedbackMap = new Map<string, Set<FeedbackAction>>();
  for (const row of feedbackRows) {
    if (!feedbackMap.has(row.postcardId)) {
      feedbackMap.set(row.postcardId, new Set());
    }
    feedbackMap.get(row.postcardId)?.add(row.action);
  }

  return postcards.map((postcard) => ({
    ...postcard,
    viewerFeedback: toViewerFeedback(feedbackMap.get(String(postcard.id)) ?? [])
  }));
}
