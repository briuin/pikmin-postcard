import type {
  FeedbackAction,
  LocationStatus,
  PostcardReportReason,
  PostcardType
} from '@/lib/domain/enums';
import type { EditablePostcard } from '@/lib/postcards/edit-history';
import type { GeoBounds } from '@/lib/postcards/geo';
import type { ViewerFeedback } from '@/lib/postcards/viewer-feedback';

export type PostcardListRow = {
  id: string;
  userId: string;
  title: string;
  postcardType: PostcardType;
  notes: string | null;
  imageUrl: string | null;
  originalImageUrl?: string | null;
  capturedAt: Date | null;
  city: string | null;
  state: string | null;
  country: string | null;
  placeName: string | null;
  latitude: number | null;
  longitude: number | null;
  aiLatitude: number | null;
  aiLongitude: number | null;
  aiConfidence: number | null;
  aiPlaceGuess: string | null;
  likeCount: number;
  dislikeCount: number;
  wrongLocationReports: number;
  reportVersion: number;
  locationStatus: LocationStatus;
  locationModelVersion: string | null;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  user: {
    email: string;
    displayName: string | null;
  };
  tags: Array<{ tag: { id: string; name: string } }>;
  uploaderName: string;
};

type StringScalarFilter = {
  equals?: string | null;
  in?: Array<string | null>;
  not?: string | null;
  contains?: string;
  mode?: 'insensitive' | 'default';
};

type NumberScalarFilter = {
  gte?: number;
  lte?: number;
  not?: number | null;
};

type NullableDateScalarFilter = {
  equals?: Date | string | null;
  not?: Date | string | null;
};

type UserRelationFilter = {
  email?: StringScalarFilter;
  displayName?: StringScalarFilter;
};

type ReportCasesRelationFilter = {
  some?: Record<string, unknown>;
};

export type PostcardWhereInput = {
  AND?: PostcardWhereInput[];
  OR?: PostcardWhereInput[];
  id?: string | StringScalarFilter;
  userId?: string | StringScalarFilter;
  title?: string | StringScalarFilter;
  notes?: string | StringScalarFilter | null;
  placeName?: string | StringScalarFilter | null;
  city?: string | StringScalarFilter | null;
  state?: string | StringScalarFilter | null;
  country?: string | StringScalarFilter | null;
  aiPlaceGuess?: string | StringScalarFilter | null;
  deletedAt?: NullableDateScalarFilter | null;
  latitude?: NumberScalarFilter | null;
  longitude?: NumberScalarFilter | null;
  likeCount?: NumberScalarFilter;
  dislikeCount?: NumberScalarFilter;
  wrongLocationReports?: NumberScalarFilter;
  createdAt?: StringScalarFilter;
  updatedAt?: StringScalarFilter;
  user?: UserRelationFilter;
  reportCases?: ReportCasesRelationFilter;
};

export type PostcardOrderDirection = 'asc' | 'desc';

export type PostcardOrderByInput = {
  id?: PostcardOrderDirection;
  userId?: PostcardOrderDirection;
  title?: PostcardOrderDirection;
  notes?: PostcardOrderDirection;
  placeName?: PostcardOrderDirection;
  city?: PostcardOrderDirection;
  state?: PostcardOrderDirection;
  country?: PostcardOrderDirection;
  aiPlaceGuess?: PostcardOrderDirection;
  deletedAt?: PostcardOrderDirection;
  latitude?: PostcardOrderDirection;
  longitude?: PostcardOrderDirection;
  createdAt?: PostcardOrderDirection;
  updatedAt?: PostcardOrderDirection;
  likeCount?: PostcardOrderDirection;
  dislikeCount?: PostcardOrderDirection;
  wrongLocationReports?: PostcardOrderDirection;
};

export type PostcardFindManyInput = {
  where?: PostcardWhereInput;
  orderBy?: PostcardOrderByInput | PostcardOrderByInput[];
  skip?: number;
  take?: number;
};

type FieldUpdate<T> = T | { set: T };

export type PostcardUpdateInput = {
  title?: FieldUpdate<string>;
  postcardType?: FieldUpdate<PostcardType>;
  notes?: FieldUpdate<string | null>;
  placeName?: FieldUpdate<string | null>;
  city?: FieldUpdate<string | null>;
  state?: FieldUpdate<string | null>;
  country?: FieldUpdate<string | null>;
  imageUrl?: FieldUpdate<string | null>;
  originalImageUrl?: FieldUpdate<string | null>;
  latitude?: FieldUpdate<number | null>;
  longitude?: FieldUpdate<number | null>;
  aiLatitude?: FieldUpdate<number | null>;
  aiLongitude?: FieldUpdate<number | null>;
  aiConfidence?: FieldUpdate<number | null>;
  aiPlaceGuess?: FieldUpdate<string | null>;
  locationStatus?: FieldUpdate<LocationStatus>;
  locationModelVersion?: FieldUpdate<string | null>;
  deletedAt?: FieldUpdate<Date | string | null>;
  [key: string]: unknown;
};

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

export type PublicPostcardSort = 'ranking' | 'newest' | 'likes' | 'reports' | 'random';

export type FindPublicPostcardsInput = {
  q?: string;
  sort: PublicPostcardSort;
  limit: number;
  bounds: GeoBounds;
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
  findForList(args: PostcardFindManyInput): Promise<PostcardListRow[]>;
  findForPublicQuery(args: FindPublicPostcardsInput): Promise<{
    rows: PostcardListRow[];
    total: number;
  }>;
  findForListWithTotal(args: PostcardFindManyInput): Promise<{
    rows: PostcardListRow[];
    total: number;
  }>;
  findById(postcardId: string): Promise<PostcardListRow | null>;
  count(where: PostcardWhereInput): Promise<number>;
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
    updateData: PostcardUpdateInput;
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
