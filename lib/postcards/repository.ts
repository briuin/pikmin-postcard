import {
  postcardRepo,
  type FindPublicPostcardsInput,
  type PostcardFindManyInput,
  type PostcardListRow
} from '@/lib/repos/postcards';
import type { PostcardWhereInput } from '@/lib/repos/postcards/types';

export async function findPostcardsForList(
  args: PostcardFindManyInput
): Promise<PostcardListRow[]> {
  return postcardRepo.findForList(args);
}

export async function findPublicPostcards(
  args: FindPublicPostcardsInput
): Promise<{ rows: PostcardListRow[]; total: number }> {
  return postcardRepo.findForPublicQuery(args);
}

export async function findPostcardsForListWithTotal(
  args: PostcardFindManyInput
): Promise<{ rows: PostcardListRow[]; total: number }> {
  return postcardRepo.findForListWithTotal(args);
}

export async function findPostcardById(postcardId: string): Promise<PostcardListRow | null> {
  return postcardRepo.findById(postcardId);
}

export async function countPostcards(where: PostcardWhereInput): Promise<number> {
  return postcardRepo.count(where);
}
