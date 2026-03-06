import { FeedbackAction } from '@prisma/client';
import { postcardRepo } from '@/lib/repos/postcards';
import {
  emptyViewerFeedback,
  toViewerFeedback,
  type ViewerFeedback
} from '@/lib/postcards/viewer-feedback';

type FeedbackRow = {
  postcardId: string;
  action: FeedbackAction;
};

export async function findViewerFeedbackRowsForPostcards(
  userId: string | null | undefined,
  postcardIds: Array<string | number>
): Promise<FeedbackRow[]> {
  if (!userId || postcardIds.length === 0) {
    return [];
  }

  return postcardRepo.findViewerFeedbackRowsForPostcards({
    userId,
    postcardIds: postcardIds.map((id) => String(id))
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
