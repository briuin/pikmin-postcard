import { Prisma } from '@prisma/client';
import { postcardRepo, type PostcardListRow } from '@/lib/repos/postcards';

export async function findPostcardsForList(
  args: Omit<Prisma.PostcardFindManyArgs, 'select'>
): Promise<PostcardListRow[]> {
  return postcardRepo.findForList(args);
}

export async function countPostcards(where: Prisma.PostcardWhereInput): Promise<number> {
  return postcardRepo.count(where);
}
