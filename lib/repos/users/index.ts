import type { UserRepo } from '@/lib/repos/users/types';
import { dynamoUserRepo } from '@/lib/repos/users/dynamo-user-repo';
import { prismaUserRepo } from '@/lib/repos/users/prisma-user-repo';
import { resolveDataStoreProvider } from '@/lib/repos/data-store-provider';

export const userRepo: UserRepo =
  resolveDataStoreProvider() === 'dynamodb' ? dynamoUserRepo : prismaUserRepo;

export type { UpsertUserByEmailInput, UserRepo, UserRepoRecord } from '@/lib/repos/users/types';
