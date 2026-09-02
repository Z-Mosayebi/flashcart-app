import { NextRequest, NextResponse } from "next/server";
import { requireUserId } from "@/lib/auth";
import { extractDriveFileId, getFileMetadata, isAuthError, listDocuments } from "@/lib/google-drive";

/**
 * GET /api/me/drive/files — the document picker's data source.
 *
 * `?q=` filters by filename. `?url=` resolves a pasted Drive link to a single
 * file, which is the fallback for a document a teacher shared that does not
 * appear in the learner's recent files.
 */
export async function GET(req: NextRequest) {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = req.nextUrl.searchParams.get("url");
  const query = req.nextUrl.searchParams.get("q") ?? undefined;

  try {
    if (url) {
      const fileId = extractDriveFileId(url);
      if (!fileId) {
        return NextResponse.json({ error: "invalid_url" }, { status: 400 });
      }
      const file = await getFileMetadata(userId, fileId);
      return NextResponse.json({ files: [file] });
    }

    return NextResponse.json({ files: await listDocuments(userId, { query }) });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Couldn't reach Google Drive";

    // Re-authorization and a transient Drive failure need different actions
    // from the user, so they must not arrive as the same error.
    if (isAuthError(err)) {
      return NextResponse.json({ error: "drive_unauthorized", detail: message }, { status: 403 });
    }
    return NextResponse.json({ error: "drive_error", detail: message }, { status: 502 });
  }
}
