import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth";
import { IMPORT_TIME_BUDGET_MS, importDocument, type ImportOutcome } from "@/lib/import";
import { isAuthError } from "@/lib/google-drive";

// Importing a long document is many model calls; give it the most the host
// allows. Progress is persisted per section, so a platform timeout leaves the
// document resumable rather than lost.
export const maxDuration = 300;

/** How many documents one request may import, so a selection can't run forever. */
const MAX_DOCUMENTS_PER_REQUEST = 5;

/**
 * POST /api/me/drive/import — turn selected Drive documents into cards.
 *
 * Documents are processed in order, and each one's progress is written to the
 * database as it goes. A client that navigates away can poll GET /api/me/drive
 * to see where the import got to.
 *
 * One request works for at most IMPORT_TIME_BUDGET_MS. Anything it didn't get
 * to comes back with status "partial"; posting those fileIds again continues
 * from the saved position.
 */
export async function POST(req: NextRequest) {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: { fileIds?: string[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const fileIds = (body.fileIds ?? []).map((id) => id.trim()).filter(Boolean);
  if (fileIds.length === 0) {
    return NextResponse.json({ error: "no_documents" }, { status: 400 });
  }
  if (fileIds.length > MAX_DOCUMENTS_PER_REQUEST) {
    return NextResponse.json(
      { error: "too_many_documents", detail: `Import up to ${MAX_DOCUMENTS_PER_REQUEST} at a time.` },
      { status: 400 }
    );
  }

  const deadline = Date.now() + IMPORT_TIME_BUDGET_MS;
  const results: ImportOutcome[] = [];

  for (const fileId of fileIds) {
    if (Date.now() > deadline) {
      // Not started: report it as partial so the client asks again.
      results.push({
        documentId: "",
        fileId,
        title: fileId,
        status: "partial",
        cardsCreated: 0,
        sectionsDone: 0,
        sectionsTotal: 0,
      });
      continue;
    }

    try {
      results.push(await importDocument(userId, fileId, deadline));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Import failed";

      // Lost Drive access affects every remaining document, so stop rather
      // than failing each one with the same message.
      if (isAuthError(err)) {
        await prisma.driveConnection.updateMany({
          where: { userId },
          data: { lastError: message },
        });
        return NextResponse.json(
          { error: "drive_unauthorized", detail: message, results },
          { status: 403 }
        );
      }

      results.push({
        documentId: "",
        fileId,
        title: fileId,
        status: "failed",
        cardsCreated: 0,
        sectionsDone: 0,
        sectionsTotal: 0,
        error: message,
      });
    }
  }

  await prisma.driveConnection.updateMany({
    where: { userId },
    data: { lastSyncedAt: new Date(), lastError: null },
  });

  return NextResponse.json({ ok: true, results });
}

/**
 * DELETE /api/me/drive/import?documentId= — stop tracking a document.
 *
 * The cards it produced are kept unless `?withCards=true`: a learner removing a
 * document usually means "stop re-importing this", not "delete what I've been
 * studying". Deleting the topics cascades to their cards and progress, so that
 * choice has to be explicit.
 */
export async function DELETE(req: NextRequest) {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const documentId = req.nextUrl.searchParams.get("documentId");
  if (!documentId) return NextResponse.json({ error: "document_required" }, { status: 400 });

  const withCards = req.nextUrl.searchParams.get("withCards") === "true";

  // Scoped by ownerId as well as id: without it, any signed-in user could
  // delete another user's document by guessing an id.
  const doc = await prisma.sourceDocument.findFirst({
    where: { id: documentId, ownerId: userId },
    select: { id: true },
  });
  if (!doc) return NextResponse.json({ error: "not_found" }, { status: 404 });

  if (withCards) {
    await prisma.sourceDocument.delete({ where: { id: doc.id } });
  } else {
    // Detach the topics first so the cascade doesn't take the cards with it.
    await prisma.topic.updateMany({
      where: { sourceDocumentId: doc.id, ownerId: userId },
      data: { sourceDocumentId: null },
    });
    await prisma.sourceDocument.delete({ where: { id: doc.id } });
  }

  return NextResponse.json({ ok: true });
}
