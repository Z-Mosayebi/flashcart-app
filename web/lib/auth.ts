import type { NextAuthOptions } from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import bcrypt from "bcryptjs";
import { getServerSession } from "next-auth";
import type { Adapter } from "next-auth/adapters";
import { prisma } from "@/lib/prisma";
import { provisionStarterDeck } from "@/lib/provisioning";

const googleId = process.env.GOOGLE_CLIENT_ID;
const googleSecret = process.env.GOOGLE_CLIENT_SECRET;

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma) as Adapter,
  session: {
    // JWT sessions keep read paths DB-free; the adapter still stores accounts.
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  pages: {
    signIn: "/signin",
    error: "/signin",
  },
  providers: [
    // Google is optional — only registered when credentials are configured,
    // so a deployment without them still boots instead of throwing at startup.
    ...(googleId && googleSecret
      ? [GoogleProvider({ clientId: googleId, clientSecret: googleSecret })]
      : []),
    CredentialsProvider({
      name: "Email and password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email = credentials?.email?.toLowerCase().trim();
        const password = credentials?.password;
        if (!email || !password) return null;

        const user = await prisma.user.findUnique({ where: { email } });
        // OAuth-only accounts have no passwordHash — reject rather than crash.
        if (!user?.passwordHash) return null;

        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) return null;

        return { id: user.id, email: user.email, name: user.name, image: user.image };
      },
    }),
  ],
  events: {
    /**
     * Provision the starter deck on first sign-in. Hooked here rather than in
     * the register route so it covers Google sign-up too, where no register
     * call ever happens. It's a no-op after the first run.
     */
    async signIn({ user }) {
      if (!user?.id) return;
      try {
        await provisionStarterDeck(user.id);
      } catch (err) {
        // Never block sign-in over this — the user can still connect Notion.
        console.error("Starter deck provisioning failed", err);
      }
    },
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.uid = user.id;
      }
      // Keep locale, name and avatar fresh on the token so the server can
      // render them without an extra query on every request. Read from the DB
      // rather than trusting what the provider sent at sign-in, so a later
      // change to the profile shows up on the next request.
      if (token.uid) {
        const dbUser = await prisma.user.findUnique({
          where: { id: token.uid as string },
          select: { locale: true, name: true, image: true },
        });
        if (dbUser) {
          token.locale = dbUser.locale;
          token.name = dbUser.name;
          token.picture = dbUser.image;
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.uid) {
        session.user.id = token.uid as string;
        session.user.locale = (token.locale as string) ?? "en";
        session.user.name = token.name ?? null;
        session.user.image = (token.picture as string | null) ?? null;
      }
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
};

/** Server-side session accessor used by route handlers and server components. */
export function auth() {
  return getServerSession(authOptions);
}

/**
 * Returns the signed-in user's id, or null. Route handlers use this instead of
 * trusting a userId from the request body — that would let any caller read or
 * write another user's progress.
 */
export async function requireUserId(): Promise<string | null> {
  const session = await auth();
  return session?.user?.id ?? null;
}
