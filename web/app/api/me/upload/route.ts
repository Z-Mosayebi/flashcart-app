import { NextRequest, NextResponse } from "next/server";
import { requireUserId } from "@/lib/auth";
import { IMPORT_TIME_BUDGET_MS, importFromSource } from "@/lib/import";
import { MAX_UPLOAD_BYTES, UploadError, mimeForUpload, parseUpload, sha256Hex } from "@/lib/file-parsers";
import { DocumentLimitError, limitResponse } from "@/lib/entitlements";

// Generating cards from a long document is many model calls.
export const maxDuration = 300;

/**
 * POST /api/me/upload — multipart form with one `file`.
 *
 * The file is parsed here and only its text is kept. The content hash is the
 * document's identity, so uploading the same file again re-uses the same
 * document (and never counts as a second one against the plan).
 */
export async function POST(req: NextRequest) {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file_required" }, { status: 400 });
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: "upload_invalid", detail: "This file is larger than 2 MB." }, { status: 400 });
  }

  const bytes = Buffer.from(await file.arrayBuffer());

  let content;
  try {
    content = await parseUpload(file.name, bytes);
  } catch (err) {
    if (err instanceof UploadError) {
      return NextResponse.json({ error: "upload_invalid", detail: err.message }, { status: err.status });
    }
    throw err;
  }

  const hash = sha256Hex(bytes);

  try {
    const result = await importFromSource(
      userId,
      {
        provider: "UPLOAD",
        externalId: hash,
        revisionId: hash,
        title: file.name.slice(0, 200),
        mimeType: mimeForUpload(file.name),
      },
      async () => content,
      Date.now() + IMPORT_TIME_BUDGET_MS
    );
    return NextResponse.json({ ok: true, result });
  } catch (err) {
    if (err instanceof DocumentLimitError) return limitResponse(err.entitlement, "documents");
    throw err;
  }
}
