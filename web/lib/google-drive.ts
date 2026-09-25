/**
 * Google Drive access: token refresh, file listing, and text extraction.
 *
 * The authorization this uses is granted during sign-in, not by a separate
 * connect step — see lib/auth.ts. That is the point of the Drive migration:
 * by the time a learner reaches the document picker, the app can already read
 * their Drive, so there is nothing to connect.
 *
 * Only the refresh token is stored (encrypted). Access tokens are minted from
 * it on demand and never persisted, so a leaked database row does not hand
 * over a credential that works immediately.
 */

import { parseXlsx } from "@/lib/file-parsers";
import { prisma } from "@/lib/prisma";
import { decryptSecret } from "@/lib/crypto";

const DRIVE_API = "https://www.googleapis.com/drive/v3";
const SHEETS_API = "https://sheets.googleapis.com/v4/spreadsheets";
const TOKEN_URL = "https://oauth2.googleapis.com/token";

/**
 * Read-only, and deliberately the narrowest scope that still supports a picker.
 *
 * `drive.readonly` is what lets the app list a user's documents so they can
 * choose one. The narrower `drive.file` would only see files the user opened
 * through a Google-hosted picker widget, which trades the in-app picker for a
 * hosted one — a worse flow for the exact step this migration exists to make
 * effortless.
 */
export const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.readonly";

export function googleConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

// ---------- Supported document types ----------

export const MIME = {
  googleDoc: "application/vnd.google-apps.document",
  googleSheet: "application/vnd.google-apps.spreadsheet",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  text: "text/plain",
  markdown: "text/markdown",
  pdf: "application/pdf",
} as const;

/** Types that become cards. PDF is excluded on purpose — see isSupported. */
const SUPPORTED_MIMES: string[] = [
  MIME.googleDoc,
  MIME.googleSheet,
  MIME.docx,
  MIME.xlsx,
  MIME.text,
  MIME.markdown,
];

/** Spreadsheets are read as rows; everything else is read as prose. */
export function isSpreadsheet(mimeType: string): boolean {
  return mimeType === MIME.googleSheet || mimeType === MIME.xlsx;
}

export function isSupported(mimeType: string): boolean {
  return SUPPORTED_MIMES.includes(mimeType);
}

/**
 * Why a file cannot be imported, in words a learner can act on. PDF gets its
 * own message because "unsupported" invites a bug report, whereas naming it
 * as a known gap does not.
 */
export function unsupportedReason(mimeType: string): string {
  if (mimeType === MIME.pdf) {
    return "PDFs aren't supported yet — try a Google Doc, Word file or spreadsheet.";
  }
  if (mimeType.startsWith("image/")) {
    return "This is an image. Flashcard reads documents and spreadsheets.";
  }
  if (mimeType === "application/vnd.google-apps.folder") {
    return "This is a folder. Pick a document inside it.";
  }
  return "This file type can't be turned into cards.";
}

// ---------- Access tokens ----------

class DriveAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DriveAuthError";
  }
}

/** True when the failure means the user must authorize again, not retry. */
export function isAuthError(err: unknown): boolean {
  return err instanceof DriveAuthError;
}

/**
 * Exchanges the stored refresh token for a short-lived access token.
 *
 * Not cached: these are cheap, and holding one in module scope on a serverless
 * host means caching per-instance for a user who may not be the next caller.
 */
export async function getAccessToken(userId: string): Promise<string> {
  const conn = await prisma.driveConnection.findUnique({ where: { userId } });
  if (!conn) {
    throw new DriveAuthError("No Google Drive access. Sign in with Google to grant it.");
  }

  let refreshToken: string;
  try {
    refreshToken = decryptSecret(conn.encryptedRefreshToken);
  } catch {
    // Unreadable ciphertext (e.g. ENCRYPTION_KEY rotated) is indistinguishable
    // from a revoked grant from the user's side: both need re-authorization.
    throw new DriveAuthError("Stored Drive access is unreadable. Sign in with Google again.");
  }

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text();
    // A refresh token stops working when the user revokes access in their
    // Google account, or when consent is withdrawn. Deleting the dead row here
    // means the UI sees "not connected" and offers the fix.
    if (res.status === 400 || res.status === 401) {
      await prisma.driveConnection.deleteMany({ where: { userId } });
      throw new DriveAuthError("Google Drive access was revoked. Sign in with Google again.");
    }
    throw new Error(`Google token refresh failed (${res.status}): ${text.slice(0, 200)}`);
  }

  const data = (await res.json()) as { access_token?: string };
  if (!data.access_token) {
    throw new Error("Google token refresh returned no access token");
  }
  return data.access_token;
}

async function driveFetch(token: string, url: string): Promise<Response> {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });

  if (res.status === 401 || res.status === 403) {
    const text = await res.text();
    // 403 covers both "insufficient scope" and "rate limited"; only the former
    // is fixed by re-authorizing, so they must not share a message.
    if (text.includes("insufficientPermissions") || text.includes("insufficient")) {
      throw new DriveAuthError(
        "Flashcard doesn't have permission to read this file. Sign in with Google again to grant access."
      );
    }
    if (res.status === 401) {
      throw new DriveAuthError("Google Drive access expired. Sign in with Google again.");
    }
    throw new Error(`Google Drive rate limit or permission error: ${text.slice(0, 200)}`);
  }

  if (res.status === 404) {
    throw new Error("File not found. It may have been deleted, or not shared with you.");
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Google Drive error ${res.status}: ${text.slice(0, 200)}`);
  }

  return res;
}

// ---------- Listing and picking ----------

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string;
  iconLink?: string;
  supported: boolean;
  /** Set only when `supported` is false, explaining why. */
  unsupportedReason?: string;
}

function toDriveFile(raw: Record<string, string>): DriveFile {
  const supported = isSupported(raw.mimeType);
  return {
    id: raw.id,
    name: raw.name,
    mimeType: raw.mimeType,
    modifiedTime: raw.modifiedTime,
    iconLink: raw.iconLink,
    supported,
    ...(supported ? {} : { unsupportedReason: unsupportedReason(raw.mimeType) }),
  };
}

/**
 * Lists candidate documents, most recently modified first.
 *
 * Unsupported types are filtered out at the query rather than hidden after the
 * fact, so a learner searching for a PDF by name gets an empty result with a
 * hint instead of a file they cannot select. Trashed files are excluded.
 */
export async function listDocuments(
  userId: string,
  options: { query?: string; limit?: number } = {}
): Promise<DriveFile[]> {
  const token = await getAccessToken(userId);
  const limit = Math.min(options.limit ?? 50, 100);

  const clauses = [
    "trashed = false",
    `(${SUPPORTED_MIMES.map((m) => `mimeType = '${m}'`).join(" or ")})`,
  ];

  if (options.query?.trim()) {
    // Escaping matters: an apostrophe in a filename would otherwise terminate
    // the quoted string and change the meaning of the query.
    const escaped = options.query.trim().replace(/\\/g, "\\\\").replace(/'/g, "\\'");
    clauses.push(`name contains '${escaped}'`);
  }

  const params = new URLSearchParams({
    q: clauses.join(" and "),
    orderBy: "modifiedTime desc",
    pageSize: String(limit),
    fields: "files(id,name,mimeType,modifiedTime,iconLink)",
    // Without this, files in a user's shared drives are invisible — a learner
    // whose notes were shared by a teacher would see an empty picker.
    supportsAllDrives: "true",
    includeItemsFromAllDrives: "true",
  });

  const res = await driveFetch(token, `${DRIVE_API}/files?${params}`);
  const data = (await res.json()) as { files?: Record<string, string>[] };
  return (data.files ?? []).map(toDriveFile);
}

/** Metadata for one file, used to validate a selection and to diff re-imports. */
export async function getFileMetadata(userId: string, fileId: string): Promise<DriveFile & { revisionId?: string }> {
  const token = await getAccessToken(userId);
  const params = new URLSearchParams({
    fields: "id,name,mimeType,modifiedTime,iconLink,headRevisionId",
    supportsAllDrives: "true",
  });

  const res = await driveFetch(token, `${DRIVE_API}/files/${fileId}?${params}`);
  const raw = (await res.json()) as Record<string, string>;
  return { ...toDriveFile(raw), revisionId: raw.headRevisionId };
}

/**
 * Pulls a Drive file id out of anything a user might paste.
 *
 * Drive URLs take several shapes: /document/d/<id>/edit, /file/d/<id>/view,
 * /spreadsheets/d/<id>, and ?id=<id> on older links.
 */
export function extractDriveFileId(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  // A bare id: Drive ids are long, and unlike a URL contain no slashes.
  if (/^[a-zA-Z0-9_-]{20,}$/.test(trimmed)) return trimmed;

  const pathMatch = trimmed.match(/\/d\/([a-zA-Z0-9_-]{20,})/);
  if (pathMatch) return pathMatch[1];

  const queryMatch = trimmed.match(/[?&]id=([a-zA-Z0-9_-]{20,})/);
  if (queryMatch) return queryMatch[1];

  return null;
}

// ---------- Text extraction ----------

/**
 * Exports a prose document as plain text.
 *
 * Google-native docs go through /export; uploaded files (.docx, .txt) are
 * downloaded with alt=media, since Drive will not export what it did not
 * convert. Word files are exported *via* Google's converter by asking for a
 * text export of the uploaded file, which avoids bundling a .docx parser.
 */
export async function fetchDocumentText(
  userId: string,
  fileId: string,
  mimeType: string
): Promise<string> {
  const token = await getAccessToken(userId);

  if (mimeType === MIME.text || mimeType === MIME.markdown) {
    const res = await driveFetch(token, `${DRIVE_API}/files/${fileId}?alt=media&supportsAllDrives=true`);
    return res.text();
  }

  // text/plain rather than text/markdown: Drive's markdown export is newer and
  // not available for every document, while plain text always is. The sectioner
  // works from headings, which survive either way.
  const params = new URLSearchParams({ mimeType: MIME.text, supportsAllDrives: "true" });
  const res = await driveFetch(token, `${DRIVE_API}/files/${fileId}/export?${params}`);
  return res.text();
}

/**
 * Reads a spreadsheet as rows.
 *
 * Google Sheets are read through the Sheets API. An .xlsx stored in Drive is
 * downloaded and parsed here instead — converting it to a Google Sheet would
 * leave a copy in the learner's Drive they never asked for.
 */
export async function fetchSpreadsheetRows(
  userId: string,
  fileId: string,
  mimeType: string
): Promise<string[][]> {
  if (mimeType === MIME.xlsx) {
    const token = await getAccessToken(userId);
    const res = await driveFetch(token, `${DRIVE_API}/files/${fileId}?alt=media&supportsAllDrives=true`);
    return parseXlsx(Buffer.from(await res.arrayBuffer()));
  }

  const token = await getAccessToken(userId);

  // The first sheet only. Multi-sheet workbooks are a real case, but picking
  // *which* sheet is a UI question this layer should not answer silently.
  const metaRes = await driveFetch(
    token,
    `${SHEETS_API}/${fileId}?fields=sheets.properties.title`
  );
  const meta = (await metaRes.json()) as {
    sheets?: { properties?: { title?: string } }[];
  };
  const firstSheet = meta.sheets?.[0]?.properties?.title;
  if (!firstSheet) throw new Error("This spreadsheet has no sheets.");

  const range = encodeURIComponent(firstSheet);
  const valuesRes = await driveFetch(token, `${SHEETS_API}/${fileId}/values/${range}`);
  const data = (await valuesRes.json()) as { values?: string[][] };

  return data.values ?? [];
}
