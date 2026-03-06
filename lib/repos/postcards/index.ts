import type { PostcardRepo } from '@/lib/repos/postcards/types';
import { dynamoPostcardRepo } from '@/lib/repos/postcards/dynamo-postcard-repo';

export const postcardRepo: PostcardRepo = dynamoPostcardRepo;

export type {
  CropBox,
  CreatePostcardInput,
  FindPublicPostcardsInput,
  PublicPostcardSort,
  PostcardCropSource,
  PostcardFeedbackRow,
  PostcardListRow,
  PostcardRepo,
  SubmitPostcardFeedbackAction,
  SubmitPostcardFeedbackInput,
  SubmitPostcardFeedbackResult,
  SubmitPostcardFeedbackResultState
} from '@/lib/repos/postcards/types';
