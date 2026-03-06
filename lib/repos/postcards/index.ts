import type { PostcardRepo } from '@/lib/repos/postcards/types';
import { resolveDataStoreProvider } from '@/lib/repos/data-store-provider';
import { dynamoPostcardRepo } from '@/lib/repos/postcards/dynamo-postcard-repo';
import { prismaPostcardRepo } from '@/lib/repos/postcards/prisma-postcard-repo';

export const postcardRepo: PostcardRepo =
  resolveDataStoreProvider() === 'dynamodb' ? dynamoPostcardRepo : prismaPostcardRepo;

export type {
  CropBox,
  CreatePostcardInput,
  PostcardCropSource,
  PostcardFeedbackRow,
  PostcardListRow,
  PostcardRepo,
  SubmitPostcardFeedbackAction,
  SubmitPostcardFeedbackInput,
  SubmitPostcardFeedbackResult,
  SubmitPostcardFeedbackResultState
} from '@/lib/repos/postcards/types';
