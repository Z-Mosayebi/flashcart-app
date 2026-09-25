/**
 * Reads files uploaded from the learner's computer into the two shapes the
 * import pipeline understands: rows (spreadsheets) or text (notes).
 *
 * Nothing here touches the database or the network, so every format is
 * unit-tested. The uploaded bytes are discarded after parsing.
 */

import { createHash } from "crypto";
import mammoth from "mammoth";
import Papa from "papaparse";
import { readSheet } from "read-excel-file/node";

export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;

export type ImportContent = { kind: "rows"; rows: string[][] } | { kind: "text"; text: string };

const UPLOAD_MIME = {
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".csv": "text/csv",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".txt": "text/plain",
  ".md": "text/markdown",
} as const;

export type UploadExtension = keyof typeof UPLOAD_MIME;

/** A problem with the file itself, reported to the learner as-is. */
export class UploadError extends Error {
  constructor(message: string, public readonly status: 400 | 422) {
    super(message);
  }
}

export function uploadExtension(fileName: string): UploadExtension | null {
  const match = /\.[^.]+$/.exec(fileName.toLowerCase());
  const ext = match?.[0];
  return ext && ext in UPLOAD_MIME ? (ext as UploadExtension) : null;
}

export function mimeForUpload(fileName: string): string {
  const ext = uploadExtension(fileName);
  return ext ? UPLOAD_MIME[ext] : "application/octet-stream";
}

export function sha256Hex(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function decodeText(bytes: Buffer): string {
  return new TextDecoder("utf-8").decode(bytes).replace(/^\uFEFF/, "");
}

function cellToString(cell: unknown): string {
  if (cell == null) return "";
  if (cell instanceof Date) return cell.toISOString().slice(0, 10);
  return String(cell).trim();
}

/** Drops rows with no content, so a sheet of blanks reads as empty. */
function nonBlankRows(rows: string[][]): string[][] {
  return rows.filter((row) => row.some((cell) => cell !== ""));
}

/** First sheet only, the same rule as Google Sheets imports. */
export async function parseXlsx(bytes: Buffer): Promise<string[][]> {
  const rows = (await readSheet(bytes)) as unknown[][];
  return nonBlankRows(rows.map((row) => row.map(cellToString)));
}

export function parseCsv(text: string): string[][] {
  const { data } = Papa.parse<string[]>(text.replace(/^\uFEFF/, ""), { skipEmptyLines: "greedy" });
  return nonBlankRows(data.map((row) => row.map((cell) => cellToString(cell))));
}

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code: string) => {
    if (code[0] === "#") {
      const n = code[1].toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : match;
    }
    return ENTITIES[code.toLowerCase()] ?? match;
  });
}

/**
 * Converts mammoth's HTML to markdown-ish text. Headings become `#` lines
 * because the sectioner splits a document on its headings — plain text from
 * a .docx would lose exactly the structure card generation relies on.
 */
export function htmlToText(html: string): string {
  const text = html
    .replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi, (_m, level: string, inner: string) =>
      `\n\n${"#".repeat(Number(level))} ${inner.replace(/<[^>]+>/g, "").trim()}\n\n`
    )
    .replace(/<li[^>]*>/gi, "\n- ")
    .replace(/<\/li>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|ul|ol|table|tr)>/gi, "\n\n")
    .replace(/<[^>]+>/g, "");

  return decodeEntities(text)
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function docxToText(bytes: Buffer): Promise<string> {
  const { value } = await mammoth.convertToHtml({ buffer: bytes });
  return htmlToText(value);
}

export async function parseUpload(fileName: string, bytes: Buffer): Promise<ImportContent> {
  const ext = uploadExtension(fileName);
  if (!ext) {
    throw new UploadError("Unsupported file type. Use .xlsx, .csv, .docx, .txt or .md.", 400);
  }
  if (bytes.length > MAX_UPLOAD_BYTES) {
    throw new UploadError("This file is larger than 2 MB.", 400);
  }

  try {
    switch (ext) {
      case ".xlsx":
        return { kind: "rows", rows: await parseXlsx(bytes) };
      case ".csv":
        return { kind: "rows", rows: parseCsv(decodeText(bytes)) };
      case ".docx":
        return { kind: "text", text: await docxToText(bytes) };
      default:
        return { kind: "text", text: decodeText(bytes) };
    }
  } catch (err) {
    console.error(`Could not parse uploaded ${ext}`, err);
    throw new UploadError(`Couldn't read this file. Is it a valid ${ext} file?`, 422);
  }
}
