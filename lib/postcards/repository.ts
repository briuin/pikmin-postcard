import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import {
  postcardListSelectWithOriginalImageUrl,
  postcardListSelectWithoutOriginalImageUrl
} from '@/lib/postcards/list';
import { hasMissingOriginalImageColumnError } from '@/lib/postcards/shared';

export type PostcardListRow =
  | Prisma.PostcardGetPayload<{ select: typeof postcardListSelectWithOriginalImageUrl }>
  | Prisma.PostcardGetPayload<{ select: typeof postcardListSelectWithoutOriginalImageUrl }>;

export async function findPostcardsForList(
  args: Omit<Prisma.PostcardFindManyArgs, 'select'>
): Promise<PostcardListRow[]> {
  try {
    return await prisma.postcard.findMany({
      ...args,
      select: postcardListSelectWithOriginalImageUrl
    });
  } catch (error) {
    if (!hasMissingOriginalImageColumnError(error)) {
      throw error;
    }

    return prisma.postcard.findMany({
      ...args,
      select: postcardListSelectWithoutOriginalImageUrl
    });
  }
}
