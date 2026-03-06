import type { UserRepo } from '@/lib/repos/users/types';
import { dynamoUserRepo } from '@/lib/repos/users/dynamo-user-repo';

export const userRepo: UserRepo = dynamoUserRepo;

export type { UpsertUserByEmailInput, UserRepo, UserRepoRecord } from '@/lib/repos/users/types';
