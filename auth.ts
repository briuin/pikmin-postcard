import NextAuth from 'next-auth';
import { UserApprovalStatus, UserRole } from '@prisma/client';
import Google from 'next-auth/providers/google';
import { prisma } from '@/lib/prisma';
import { defaultApprovalStatusForRole } from '@/lib/user-approval';
import { normalizeEmail, roleForEmail } from '@/lib/user-role';

export const { handlers, auth } = NextAuth({
  trustHost: true,
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID ?? 'missing-google-client-id',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? 'missing-google-client-secret'
    })
  ],
  session: {
    strategy: 'jwt'
  },
  callbacks: {
    async signIn({ account, profile }) {
      if (account?.provider !== 'google' || !profile?.email) {
        return false;
      }

      const email = normalizeEmail(String(profile.email));
      const name =
        typeof profile.name === 'string' && profile.name.trim().length > 0
          ? profile.name.trim()
          : null;
      const defaultRole = roleForEmail(email);

      await prisma.user.upsert({
        where: { email },
        update:
          defaultRole === UserRole.ADMIN
            ? {
                role: UserRole.ADMIN,
                approvalStatus: UserApprovalStatus.APPROVED
              }
            : {},
        create: {
          email,
          displayName: name,
          role: defaultRole,
          approvalStatus: defaultApprovalStatusForRole(defaultRole)
        }
      });

      return true;
    },
    async jwt({ token }) {
      const tokenEmail = typeof token.email === 'string' ? token.email : '';
      if (!tokenEmail) {
        return token;
      }

      const email = normalizeEmail(tokenEmail);
      const defaultRole = roleForEmail(email);
      let user = await prisma.user.findUnique({
        where: { email },
        select: {
          id: true,
          role: true,
          approvalStatus: true
        }
      });

      if (!user) {
        user = await prisma.user.create({
          data: {
            email,
            role: defaultRole,
            approvalStatus: defaultApprovalStatusForRole(defaultRole)
          },
          select: {
            id: true,
            role: true,
            approvalStatus: true
          }
        });
      } else if (defaultRole === UserRole.ADMIN && user.role !== UserRole.ADMIN) {
        user = await prisma.user.update({
          where: { email },
          data: { role: UserRole.ADMIN, approvalStatus: UserApprovalStatus.APPROVED },
          select: {
            id: true,
            role: true,
            approvalStatus: true
          }
        });
      }

      token.role = user.role;
      token.approvalStatus = user.approvalStatus;
      token.userId = user.id;
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = typeof token.userId === 'string' ? token.userId : '';
        session.user.role =
          token.role === UserRole.ADMIN || token.role === UserRole.MANAGER
            ? token.role
            : UserRole.MEMBER;
        session.user.approvalStatus =
          token.approvalStatus === UserApprovalStatus.APPROVED
            ? UserApprovalStatus.APPROVED
            : UserApprovalStatus.PENDING;
      }
      return session;
    }
  }
});
