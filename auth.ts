import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';

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
      return account?.provider === 'google' && !!profile?.email;
    }
  }
});
