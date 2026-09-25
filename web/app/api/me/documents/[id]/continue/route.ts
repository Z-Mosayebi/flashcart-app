import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth";
import { IMPORT_TIME_BUDGET_MS, continueImport } from "@/lib/import";
import { DocumentLimitError, limitResponse } from "@/lib/entitlements";
import { isAuthError } from "@/lib/google-drive";

export const maxDuration = 300;

/**
 * POST /api/me/documents/{id}/continue — continue an unfinished import,
 * whether it came from Drive or an upload. Call again while the result's
 * status is "partial".
 */
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    const result = await continueImport(userId, params.id, Date.now() + IMPORT_TIME_BUDGET_MS);
    if (!result) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json({ ok: true, result });
  } catch (err) {
    if (err instanceof DocumentLimitError) return limitResponse(err.entitlement, "documents");
    const message = err instanceof Error ? err.message : "Import failed";
    if (isAuthError(err)) {
      await prisma.driveConnection.updateMany({ where: { userId }, data: { lastError: message } });
      return NextResponse.json({ error: "drive_unauthorized", detail: message }, { status: 403 });
    }
    return NextResponse.json({ error: "continue_failed", detail: message }, { status: 400 });
  }
}
