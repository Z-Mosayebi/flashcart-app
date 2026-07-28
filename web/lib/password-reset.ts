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

/** Builds the absolute link that goes in the email. */
export function resetUrl(token: string): string {
  const base = (process.env.NEXTAUTH_URL || "http://localhost:3000").replace(/\/$/, "");
  return `${base}/reset-password?token=${encodeURIComponent(token)}`;
}
