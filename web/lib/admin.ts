/**
 * Admin access. The allow-list is ADMIN_EMAILS; the email is read from the
 * database rather than the session so a stale token can't keep access.
 */

import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth";
import { isAdminEmail } from "@/lib/plans";

export async function isAdminUser(userId: string | null): Promise<boolean> {
  if (!userId) return false;
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
  return isAdminEmail(user?.email);
}

/** The signed-in admin's id, or null for anyone else (including signed out). */
export async function requireAdminId(): Promise<string | null> {
  const userId = await requireUserId();
  return (await isAdminUser(userId)) ? userId : null;
}
