import { FeedbackAction } from '@prisma/client';
import { prisma } from '@/lib/prisma';

export type ViewerFeedback = {
  liked: boolean;
  disliked: boolean;
  reportedWrongLocation: boolean;
};

type FeedbackRow = {
  postcardId: string;
  action: FeedbackAction;
};

function emptyViewerFeedback(): ViewerFeedback {
  return {
    liked: false,
    disliked: false,
    reportedWrongLocation: false
  };
}

export function toViewerFeedback(actions: Iterable<FeedbackAction>): ViewerFeedback {
  const set = new Set(actions);

  return {
    liked: set.has(FeedbackAction.LIKE),
    disliked: set.has(FeedbackAction.DISLIKE),
    reportedWrongLocation: set.has(FeedbackAction.REPORT_WRONG_LOCATION)
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

  return prisma.postcardFeedback.findMany({
    where: {
      userId,
      postcardId: {
        in: ids
      }
    },
    select: {
      postcardId: true,
      action: true
    }
  });
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
