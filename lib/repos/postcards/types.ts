import {
  type FeedbackAction,
  type LocationStatus,
  type PostcardReportReason,
  type PostcardType,
  Prisma
} from '@prisma/client';
import {
  postcardListSelectWithOriginalImageUrl,
  postcardListSelectWithoutOriginalImageUrl
} from '@/lib/postcards/list';
import type { EditablePostcard } from '@/lib/postcards/edit-history';
import type { GeoBounds } from '@/lib/postcards/geo';
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

export type PublicPostcardSort = 'ranking' | 'newest' | 'likes' | 'reports';

export type FindPublicPostcardsInput = {
  q?: string;
  sort: PublicPostcardSort;
  limit: number;
  bounds?: GeoBounds;
};

export type CreatePostcardInput = {
  userId: string;
  title: string;
  postcardType: PostcardType;
  notes?: string | null;
  imageUrl?: string | null;
  originalImageUrl?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  placeName?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  aiLatitude?: number | null;
  aiLongitude?: number | null;
  aiConfidence?: number | null;
  aiPlaceGuess?: string | null;
  locationStatus?: LocationStatus | null;
  locationModelVersion?: string | null;
};

export type CropBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type PostcardCropSource = {
  id: string;
  imageUrl: string | null;
  originalImageUrl: string | null;
};

export type PostcardRepo = {
  findForList(args: Omit<Prisma.PostcardFindManyArgs, 'select'>): Promise<PostcardListRow[]>;
  findForPublicQuery(args: FindPublicPostcardsInput): Promise<{
    rows: PostcardListRow[];
    total: number;
  }>;
  findForListWithTotal(args: Omit<Prisma.PostcardFindManyArgs, 'select'>): Promise<{
    rows: PostcardListRow[];
    total: number;
  }>;
  findById(postcardId: string): Promise<PostcardListRow | null>;
  count(where: Prisma.PostcardWhereInput): Promise<number>;
  create(input: CreatePostcardInput): Promise<Record<string, unknown>>;
  findCropSource(params: { postcardId: string; userId?: string }): Promise<PostcardCropSource | null>;
  findEditableForActor(params: {
    postcardId: string;
    actorId: string;
    canEditAny: boolean;
  }): Promise<EditablePostcard | null>;
  applyCropUpdateWithHistory(params: {
    postcardId: string;
    actorId: string;
    canEditAny: boolean;
    imageUrl: string;
    originalImageUrl?: string | null;
    crop: CropBox;
  }): Promise<{ imageUrl: string | null; originalImageUrl: string | null } | null>;
  applyDetailsUpdateWithHistory(params: {
    postcardId: string;
    actorId: string;
    canEditAny: boolean;
    updateData: Prisma.PostcardUpdateInput;
  }): Promise<EditablePostcard | null>;
  softDeleteWithHistory(params: {
    postcardId: string;
    actorId: string;
    deletedAt: Date;
  }): Promise<boolean>;
  findSavedPostcardIdsByUser(params: { userId: string; take: number }): Promise<string[]>;
  findViewerFeedbackRowsForPostcards(params: {
    userId: string;
    postcardIds: string[];
  }): Promise<PostcardFeedbackRow[]>;
  submitFeedback(
    params: SubmitPostcardFeedbackInput
  ): Promise<SubmitPostcardFeedbackResult | null>;
};
