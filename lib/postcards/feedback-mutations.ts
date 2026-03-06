import { PostcardReportReason } from '@/lib/domain/enums';
import {
  postcardRepo,
  type SubmitPostcardFeedbackAction,
  type SubmitPostcardFeedbackResultState
} from '@/lib/repos/postcards';
import { type ViewerFeedback } from '@/lib/postcards/viewer-feedback';

export type FeedbackInputAction =
  | 'like'
  | 'dislike'
  | 'favorite'
  | 'collected'
  | 'report'
  | 'report_wrong_location';
export type FeedbackResult = SubmitPostcardFeedbackResultState;
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

function toSubmitAction(action: FeedbackInputAction): SubmitPostcardFeedbackAction {
  if (action === 'report' || action === 'report_wrong_location') {
    return 'report';
  }

  return action;
}

export async function submitPostcardFeedback(params: {
  postcardId: string;
  userId: string;
  action: FeedbackInputAction;
  reportReason?: FeedbackReportReasonInput;
  reportDescription?: string | null;
}): Promise<FeedbackMutationResult | null> {
  const action = toSubmitAction(params.action);
  return postcardRepo.submitFeedback({
    postcardId: params.postcardId,
    userId: params.userId,
    action,
    reportReason: params.reportReason ? toReportReason(params.reportReason) : undefined,
    reportDescription: params.reportDescription
  });
}
