import type { UserRepo } from '@/lib/repos/users/types';
import { dynamoUserRepo } from '@/lib/repos/users/dynamo-user-repo';
import { prismaUserRepo } from '@/lib/repos/users/prisma-user-repo';

function resolveDataStoreProvider(): 'prisma' | 'dynamodb' {
  const value = (process.env.APP_DATA_STORE ?? process.env.DATA_STORE ?? '').trim().toLowerCase();
  if (value === 'dynamodb' || value === 'ddb') {
    return 'dynamodb';
  }
  if (value === 'prisma') {
    return 'prisma';
  }
  if (!process.env.DATABASE_URL) {
    return 'dynamodb';
  }
  return 'prisma';
}

export const userRepo: UserRepo =
  resolveDataStoreProvider() === 'dynamodb' ? dynamoUserRepo : prismaUserRepo;

export type { UpsertUserByEmailInput, UserRepo, UserRepoRecord } from '@/lib/repos/users/types';
