import { type FeedbackAction, type PostcardReportReason, Prisma } from '@prisma/client';
import {
  postcardListSelectWithOriginalImageUrl,
  postcardListSelectWithoutOriginalImageUrl
} from '@/lib/postcards/list';
import type { ViewerFeedback } from '@/lib/postcards/viewer-feedback';

export type PostcardListRow =
  | Prisma.PostcardGetPayload<{ select: typeof postcardListSelectWithOriginalImageUrl }>
  | Prisma.PostcardGetPayload<{ select: typeof postcardListSelectWithoutOriginalImageUrl }>;

export type PostcardFeedbackRow = {
  postcardId: string;
  action: FeedbackAction;
};

export type SubmitPostcardFeedbackAction = 'like' | 'dislike' | 'favorite' | 'collected' | 'report';
export type SubmitPostcardFeedbackResultState = 'added' | 'removed' | 'switched' | 'already_reported';

export type SubmitPostcardFeedbackInput = {
  postcardId: string;
  userId: string;
  action: SubmitPostcardFeedbackAction;
  reportReason?: PostcardReportReason;
  reportDescription?: string | null;
};

export type SubmitPostcardFeedbackResult = {
  id: string;
  likeCount: number;
  dislikeCount: number;
  wrongLocationReports: number;
  result: SubmitPostcardFeedbackResultState;
  action: SubmitPostcardFeedbackAction;
  viewerFeedback: ViewerFeedback;
};

export type PostcardRepo = {
  findForList(args: Omit<Prisma.PostcardFindManyArgs, 'select'>): Promise<PostcardListRow[]>;
  count(where: Prisma.PostcardWhereInput): Promise<number>;
  findSavedPostcardIdsByUser(params: { userId: string; take: number }): Promise<string[]>;
  findViewerFeedbackRowsForPostcards(params: {
    userId: string;
    postcardIds: string[];
  }): Promise<PostcardFeedbackRow[]>;
  submitFeedback(
    params: SubmitPostcardFeedbackInput
  ): Promise<SubmitPostcardFeedbackResult | null>;
};
