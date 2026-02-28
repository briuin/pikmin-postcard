import type { UserApprovalStatus, UserRole } from '@prisma/client';
import type { DefaultSession } from 'next-auth';
import 'next-auth';
import 'next-auth/jwt';

declare module 'next-auth' {
  interface Session {
    user: {
      role: UserRole;
      approvalStatus: UserApprovalStatus;
    } & DefaultSession['user'];
  }

  interface User {
    role: UserRole;
    approvalStatus: UserApprovalStatus;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    role?: UserRole;
    approvalStatus?: UserApprovalStatus;
    userId?: string;
  }
}
