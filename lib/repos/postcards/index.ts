import type { PostcardRepo } from '@/lib/repos/postcards/types';
import { dynamoPostcardRepo } from '@/lib/repos/postcards/dynamo-postcard-repo';

export const postcardRepo: PostcardRepo = dynamoPostcardRepo;

export type {
  CropBox,
  CreatePostcardInput,
  FindPublicPostcardsInput,
  PostcardFindManyInput,
  PostcardOrderByInput,
  PublicPostcardSort,
  PostcardCropSource,
  PostcardFeedbackRow,
  PostcardListRow,
  PostcardUpdateInput,
  PostcardWhereInput,
  PostcardRepo,
  SubmitPostcardFeedbackAction,
  SubmitPostcardFeedbackInput,
  SubmitPostcardFeedbackResult,
  SubmitPostcardFeedbackResultState
} from '@/lib/repos/postcards/types';
