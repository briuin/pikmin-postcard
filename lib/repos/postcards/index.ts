import type { PostcardRepo } from '@/lib/repos/postcards/types';
import { prismaPostcardRepo } from '@/lib/repos/postcards/prisma-postcard-repo';

export const postcardRepo: PostcardRepo = prismaPostcardRepo;

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
