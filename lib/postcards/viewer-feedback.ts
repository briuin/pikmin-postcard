import { FeedbackAction } from '@prisma/client';

export type ViewerFeedback = {
  liked: boolean;
  disliked: boolean;
  reportedWrongLocation: boolean;
  favorited: boolean;
  collected: boolean;
};

export function emptyViewerFeedback(): ViewerFeedback {
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
