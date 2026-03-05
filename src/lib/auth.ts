import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";
import { prisma } from "@/lib/db";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    GitHub({
      clientId: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET,
      authorization: { params: { scope: "read:user repo" } },
    }),
  ],
  callbacks: {
    async jwt({ token, account }) {
      if (account) {
        token.accessToken = account.access_token;
        token.githubId = account.providerAccountId;
      }
      return token;
    },
    async session({ session, token }) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (session as any).accessToken = token.accessToken;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (session as any).githubId = token.githubId;
      return session;
    },
  },
  pages: {
    signIn: "/",
  },
});

export async function getDbUser() {
  const session = await auth();
  if (!session?.user) return null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const githubId = parseInt((session as any).githubId, 10);
  if (!githubId || isNaN(githubId)) return null;

  return prisma.user.upsert({
    where: { githubId },
    update: {
      name: session.user.name ?? undefined,
      email: session.user.email ?? undefined,
      avatarUrl: session.user.image ?? undefined,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      accessToken: (session as any).accessToken ?? undefined,
    },
    create: {
      githubId,
      name: session.user.name,
      email: session.user.email,
      avatarUrl: session.user.image,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      accessToken: (session as any).accessToken,
    },
  });
}
