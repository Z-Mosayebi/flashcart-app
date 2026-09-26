import type { NextAuthOptions } from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import bcrypt from "bcryptjs";
import { getServerSession } from "next-auth";
import type { Adapter } from "next-auth/adapters";
import { prisma } from "@/lib/prisma";
import { provisionStarterDeck } from "@/lib/provisioning";
import { DRIVE_SCOPE } from "@/lib/google-drive";
import { encryptSecret } from "@/lib/crypto";
import { isAdminEmail } from "@/lib/plans";

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
      ? [
          GoogleProvider({
            clientId: googleId,
            clientSecret: googleSecret,
            authorization: {
              params: {
                // Drive access is requested here, in the sign-in consent, rather
                // than behind a separate "connect" step. That is the whole point
                // of the Drive migration: by the time a learner reaches the
                // document picker, the app can already read their Drive.
                scope: `openid email profile ${DRIVE_SCOPE}`,
                // A refresh token is only issued with offline access, and only
                // on the *first* consent unless prompt=consent forces it. Without
                // both, a returning user grants access that expires in an hour
                // and cannot be renewed.
                access_type: "offline",
                prompt: "consent",
              },
            },
          }),
        ]
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
    async signIn({ user, account }) {
      if (!user?.id) return;

      try {
        await provisionStarterDeck(user.id);
      } catch (err) {
        // Never block sign-in over this — an empty deck is a bad first
        // impression, a failed login is worse.
        console.error("Starter deck provisioning failed", err);
      }

      if (account?.provider === "google") {
        try {
          await storeDriveGrant(user.id, account);
        } catch (err) {
          // Sign-in must succeed even when Drive access does not. The user
          // lands signed in, and Settings shows importing as unavailable with
          // a way to grant it, rather than the login failing outright.
          console.error("Storing Drive access failed", err);
        }
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
          select: { locale: true, name: true, image: true, email: true },
        });
        if (dbUser) {
          token.locale = dbUser.locale;
          token.name = dbUser.name;
          token.picture = dbUser.image;
          // Only drives whether the nav shows the admin link; admin pages and
          // APIs re-check against the database on every request.
          token.isAdmin = isAdminEmail(dbUser.email);
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
        session.user.isAdmin = Boolean(token.isAdmin);
      }
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
};

/**
 * Persists the Drive half of a Google sign-in.
 *
 * Only the refresh token is kept, and only when Google actually issued one —
 * it is absent on a repeat consent, and overwriting a good stored token with
 * nothing would silently break importing for a returning user.
 *
 * The granted scopes are recorded rather than assumed: a consent screen lets
 * users untick Drive while still signing in, and the UI has to be able to tell
 * "never granted" from "granted then revoked".
 */
async function storeDriveGrant(
  userId: string,
  account: { refresh_token?: string | null; scope?: string | null }
): Promise<void> {
  const scopes = (account.scope ?? "").split(" ").filter(Boolean);

  if (!scopes.includes(DRIVE_SCOPE)) {
    // Signed in without granting Drive. Any previously stored grant is stale.
    await prisma.driveConnection.deleteMany({ where: { userId } });
    return;
  }

  if (!account.refresh_token) {
    // Drive was granted but no new refresh token came back, which means one was
    // issued earlier. Refresh the recorded scopes and keep the stored token.
    await prisma.driveConnection.updateMany({ where: { userId }, data: { scopes } });
    return;
  }

  const encryptedRefreshToken = encryptSecret(account.refresh_token);

  await prisma.driveConnection.upsert({
    where: { userId },
    create: { userId, encryptedRefreshToken, scopes },
    update: { encryptedRefreshToken, scopes, lastError: null },
  });
}

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
