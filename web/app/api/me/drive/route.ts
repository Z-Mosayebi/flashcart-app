import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth";
import { googleConfigured } from "@/lib/google-drive";

/**
 * GET /api/me/drive — Drive access status and the documents already imported.
 *
 * There is no "connect" action to report: access is granted during Google
 * sign-in. When it is missing, the fix is to sign in with Google again, which
 * is what `connected: false` means here.
 */
export async function GET() {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const [conn, documents] = await Promise.all([
    prisma.driveConnection.findUnique({ where: { userId } }),
    prisma.sourceDocument.findMany({
      where: { ownerId: userId },
      orderBy: { lastSyncedAt: "desc" },
      select: {
        id: true,
        provider: true,
        externalId: true,
        title: true,
        mimeType: true,
        status: true,
        sectionsDone: true,
        sectionsTotal: true,
        lastSyncedAt: true,
        lastError: true,
        _count: { select: { topics: true } },
      },
    }),
  ]);

  return NextResponse.json({
    available: googleConfigured(),
    connected: Boolean(conn),
    lastSyncedAt: conn?.lastSyncedAt ?? null,
    lastError: conn?.lastError ?? null,
    documents: documents.map((doc) => ({
      ...doc,
      topicCount: doc._count.topics,
      _count: undefined,
      // Documents imported before the move to Drive can be reviewed but not
      // re-imported, since the connection that fetched them is gone.
      readOnly: doc.provider === "NOTION",
    })),
  });
}

/**
 * DELETE /api/me/drive — revoke stored Drive access.
 *
 * Generated cards are deliberately kept: they are the learner's study material,
 * not Drive's, and losing a deck is far worse than the cost of withdrawing
 * access. Documents stay listed so re-authorizing resumes where they left off.
 */
export async function DELETE() {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  await prisma.driveConnection.deleteMany({ where: { userId } });
  return NextResponse.json({ ok: true });
}
