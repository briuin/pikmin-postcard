import { Prisma } from '@prisma/client';
import { postcardRepo, type PostcardListRow } from '@/lib/repos/postcards';

export async function findPostcardsForList(
  args: Omit<Prisma.PostcardFindManyArgs, 'select'>
): Promise<PostcardListRow[]> {
  return postcardRepo.findForList(args);
}

export async function findPostcardsForListWithTotal(
  args: Omit<Prisma.PostcardFindManyArgs, 'select'>
): Promise<{ rows: PostcardListRow[]; total: number }> {
  return postcardRepo.findForListWithTotal(args);
}

export async function findPostcardById(postcardId: string): Promise<PostcardListRow | null> {
  return postcardRepo.findById(postcardId);
}

export async function countPostcards(where: Prisma.PostcardWhereInput): Promise<number> {
  return postcardRepo.count(where);
}
