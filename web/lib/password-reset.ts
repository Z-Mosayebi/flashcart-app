/**
 * Password reset tokens.
 *
 * The token is a 32-byte random value handed out only in the emailed link. What
 * the database holds is its SHA-256 hash, so reading the table gives an attacker
 * nothing usable — the same reason passwords are hashed. Plain SHA-256 is
 * sufficient here (unlike for passwords, which need bcrypt): the input is
 * already high-entropy random, so there is nothing to brute-force.
 */

import { createHash, randomBytes, timingSafeEqual } from "crypto";
import { prisma } from "@/lib/prisma";

/** Short-lived by design: long enough to switch to an email app, no longer. */
export const RESET_TOKEN_TTL_MINUTES = 60;

export const MIN_PASSWORD_LENGTH = 8;

export function hashResetToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * How long to wait between reset emails for the same account. Stops someone
 * flooding a user's inbox by submitting the form repeatedly, and stops the
 * mail provider's monthly quota being burned by a trivial script.
 */
const RESEND_COOLDOWN_MS = 60_000;

/**
 * True when a link was already sent to this user within the cooldown window.
 * The caller still responds as though it sent one — telling the client it was
 * throttled would confirm the address exists.
 */
export async function recentlyRequested(userId: string): Promise<boolean> {
  const latest = await prisma.passwordResetToken.findFirst({
    where: { userId, usedAt: null },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  if (!latest) return false;
  return Date.now() - latest.createdAt.getTime() < RESEND_COOLDOWN_MS;
}

/**
 * Same cooldown for OAuth accounts, which never get a reset token and so have
 * nothing for `recentlyRequested` to measure. Recorded in VerificationToken —
 * NextAuth's own scratch table, already present and cleaned up by expiry — to
 * avoid a migration for what is only a rate-limit marker.
 *
 * Returns true when a notice was already sent inside the window.
 */
export async function oauthNoticeThrottled(userId: string): Promise<boolean> {
  const identifier = `oauth-reset-notice:${userId}`;
  const now = new Date();

  const existing = await prisma.verificationToken.findFirst({
    where: { identifier, expires: { gt: now } },
    select: { token: true },
  });
  if (existing) return true;

  // Expired markers for this user are dead weight; clear them as we go.
  await prisma.verificationToken.deleteMany({ where: { identifier } });
  await prisma.verificationToken.create({
    data: {
      identifier,
      token: randomBytes(16).toString("base64url"),
      expires: new Date(now.getTime() + RESEND_COOLDOWN_MS),
    },
  });
  return false;
}

/**
 * Issues a token for a user and returns the raw value to embed in the email.
 * Any outstanding tokens are invalidated first, so requesting a second link
 * immediately retires the first one.
 */
export async function createResetToken(userId: string): Promise<string> {
  await prisma.passwordResetToken.deleteMany({ where: { userId, usedAt: null } });

  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MINUTES * 60_000);

  await prisma.passwordResetToken.create({
    data: { tokenHash: hashResetToken(token), userId, expiresAt },
  });

  return token;
}

type ResetTokenRow = { id: string; userId: string };

/**
 * Returns the token row when the token is valid — unknown, expired, and
 * already-used tokens all resolve to null so callers can't tell them apart.
 */
export async function findValidResetToken(token: string): Promise<ResetTokenRow | null> {
  if (!token) return null;

  const record = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: hashResetToken(token) },
    select: { id: true, userId: true, expiresAt: true, usedAt: true, tokenHash: true },
  });

  if (!record || record.usedAt || record.expiresAt < new Date()) return null;

  // The lookup above already matched on the hash; comparing again in constant
  // time keeps the code honest if that query is ever loosened.
  const expected = Buffer.from(record.tokenHash, "hex");
  const actual = Buffer.from(hashResetToken(token), "hex");
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;

  return { id: record.id, userId: record.userId };
}

function appBaseUrl(): string {
  return (process.env.NEXTAUTH_URL || "http://localhost:3000").replace(/\/$/, "");
}

/** Builds the absolute link that goes in the email. */
export function resetUrl(token: string): string {
  return `${appBaseUrl()}/reset-password?token=${encodeURIComponent(token)}`;
}

/** Sign-in page link, for telling OAuth users where to go instead. */
export function signInUrl(): string {
  return `${appBaseUrl()}/signin`;
}
