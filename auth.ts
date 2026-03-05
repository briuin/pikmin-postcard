import NextAuth from 'next-auth';
import { UserApprovalStatus, UserRole } from '@prisma/client';
import Google from 'next-auth/providers/google';
import { ensureUserByEmail } from '@/lib/dynamo-users';

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

      const name =
        typeof profile.name === 'string' && profile.name.trim().length > 0
          ? profile.name.trim()
          : null;
      await ensureUserByEmail({
        email: String(profile.email),
        displayName: name
      });

      return true;
    },
    async jwt({ token }) {
      const tokenEmail = typeof token.email === 'string' ? token.email : '';
      if (!tokenEmail) {
        return token;
      }

      const user = await ensureUserByEmail({
        email: tokenEmail
      });

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
