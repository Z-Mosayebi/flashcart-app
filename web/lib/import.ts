/**
 * Document import: Drive → sections → cards.
 *
 * Importing a real notes document is minutes of work and dozens of model calls,
 * which is far too long to hold an HTTP request open. So progress lives in the
 * database rather than in memory: the learner can close the app mid-import, and
 * a web tier that restarts can pick the document back up.
 *
 * Cards are written section by section rather than in one batch at the end. A
 * long import is then useful before it finishes — review can start on the first
 * sections while the rest are still generating — and a failure late in a
 * document keeps everything already generated.
 */

import { prisma } from "@/lib/prisma";
import { generateCards, type GeneratedCard } from "@/lib/ai";
import {
  MIME,
  fetchDocumentText,
  fetchSpreadsheetRows,
  getFileMetadata,
  isSpreadsheet,
  isSupported,
  unsupportedReason,
} from "@/lib/google-drive";
import { buildCardsFromRows, detectColumns, rowsToMarkdown } from "@/lib/spreadsheet-cards";
import { splitIntoSections, type Section } from "@/lib/sectioner";
import type { ImportContent } from "@/lib/file-parsers";
import { DocumentLimitError, getEntitlement } from "@/lib/entitlements";
import { atLimit } from "@/lib/plans";

/**
 * How long one request may spend generating before it hands back. The route's
 * maxDuration is 300s and a single section can take ~90s in the worst case
 * (45s timeout plus one retry), so no new section is started after 180s. That
 * keeps the request inside the platform limit instead of being killed mid-way.
 */
export const IMPORT_TIME_BUDGET_MS = 180_000;

/** The AI service rejects notes longer than this. */
const MAX_NOTES_CHARS = 60_000;

/** Documents imported as rows; everything else is prose split into sections. */
const ROWS_MIMES: string[] = [MIME.googleSheet, MIME.xlsx, "text/csv"];

export interface ImportOutcome {
  documentId: string;
  /** The document's external id (Drive file id, or upload hash). */
  fileId: string;
  title: string;
  /** "partial": the time budget ran out; continuing picks up where it stopped. */
  status: "unchanged" | "imported" | "partial" | "failed";
  cardsCreated: number;
  sectionsDone: number;
  sectionsTotal: number;
  error?: string;
}

/** Identifies a document independently of where it came from. */
export interface SourceRef {
  provider: "GOOGLE_DRIVE" | "UPLOAD";
  externalId: string;
  /** Changes only when content does. Uploads use the content hash. */
  revisionId: string | null;
  title: string;
  mimeType: string;
  modifiedTime?: string | null;
}

interface SectionProgress {
  cardsCreated: number;
  sectionsDone: number;
  sectionsTotal: number;
  remaining?: boolean;
}

type StoredDocument = NonNullable<Awaited<ReturnType<typeof prisma.sourceDocument.findUnique>>>;

/** An interrupted prose import of the same revision can pick up from its stored text. */
function resumePoint(doc: StoredDocument | null, revisionId: string | null) {
  if (
    doc &&
    (doc.status === "IMPORTING" || doc.status === "PENDING") &&
    doc.revisionId != null &&
    doc.revisionId === revisionId &&
    !ROWS_MIMES.includes(doc.mimeType ?? "") &&
    doc.rawMarkdown.length > 0 &&
    doc.sectionsTotal > 0 &&
    doc.sectionsDone < doc.sectionsTotal
  ) {
    return { text: doc.rawMarkdown, from: doc.sectionsDone };
  }
  return undefined;
}

/** Imports one Drive document. See importFromSource for the guarantees. */
export async function importDocument(
  userId: string,
  fileId: string,
  deadline: number = Date.now() + IMPORT_TIME_BUDGET_MS
): Promise<ImportOutcome> {
  const meta = await getFileMetadata(userId, fileId);
  if (!isSupported(meta.mimeType)) {
    throw new Error(unsupportedReason(meta.mimeType));
  }

  return importFromSource(
    userId,
    {
      provider: "GOOGLE_DRIVE",
      externalId: fileId,
      revisionId: meta.revisionId ?? null,
      title: meta.name,
      mimeType: meta.mimeType,
      modifiedTime: meta.modifiedTime,
    },
    async () =>
      isSpreadsheet(meta.mimeType)
        ? { kind: "rows", rows: await fetchSpreadsheetRows(userId, fileId, meta.mimeType) }
        : { kind: "text", text: await fetchDocumentText(userId, fileId, meta.mimeType) },
    deadline
  );
}

/**
 * Imports one document from any source into a user's deck.
 *
 * Safe to call again: unchanged documents are skipped by revision, cards are
 * de-duplicated by prompt, and an interrupted import resumes at the section it
 * reached. A *new* document beyond the plan's allowance throws
 * DocumentLimitError before anything is written; an existing one is always
 * allowed, since re-importing costs the learner no new document.
 */
export async function importFromSource(
  userId: string,
  ref: SourceRef,
  load: () => Promise<ImportContent>,
  deadline: number = Date.now() + IMPORT_TIME_BUDGET_MS
): Promise<ImportOutcome> {
  const key = {
    ownerId_provider_externalId: { ownerId: userId, provider: ref.provider, externalId: ref.externalId },
  };
  const existing = await prisma.sourceDocument.findUnique({ where: key });

  if (!existing) {
    const entitlement = await getEntitlement(userId);
    if (atLimit(entitlement, "documents")) throw new DocumentLimitError(entitlement);
  }

  const unchanged =
    existing?.status === "COMPLETE" && existing.revisionId != null && existing.revisionId === ref.revisionId;

  if (unchanged) {
    return {
      documentId: existing.id,
      fileId: ref.externalId,
      title: existing.title,
      status: "unchanged",
      cardsCreated: 0,
      sectionsDone: existing.sectionsDone,
      sectionsTotal: existing.sectionsTotal,
    };
  }

  const resume = resumePoint(existing, ref.revisionId);

  const doc = await prisma.sourceDocument.upsert({
    where: key,
    create: {
      provider: ref.provider,
      externalId: ref.externalId,
      title: ref.title,
      rawMarkdown: "",
      mimeType: ref.mimeType,
      ownerId: userId,
      status: "IMPORTING",
      // Recorded up front so an interrupted import can tell whether the
      // document changed before resuming. It only marks the document up to
      // date together with status COMPLETE, so a partial import is never skipped.
      revisionId: ref.revisionId,
    },
    update: resume
      ? { status: "IMPORTING", lastError: null }
      : {
          title: ref.title,
          mimeType: ref.mimeType,
          status: "IMPORTING",
          revisionId: ref.revisionId,
          sectionsDone: 0,
          sectionsTotal: 0,
          lastError: null,
        },
  });

  try {
    const outcome = resume
      ? await processText(userId, doc.id, resume.text, ref.title, deadline, resume.from)
      : await processContent(userId, doc.id, await load(), ref.title, deadline);

    const progress = {
      cardsCreated: outcome.cardsCreated,
      sectionsDone: outcome.sectionsDone,
      sectionsTotal: outcome.sectionsTotal,
    };

    if (outcome.remaining) {
      // Out of time, not out of work: leave it resumable for the next call.
      await prisma.sourceDocument.update({ where: { id: doc.id }, data: { status: "PENDING" } });
      return { documentId: doc.id, fileId: ref.externalId, title: ref.title, status: "partial", ...progress };
    }

    await prisma.sourceDocument.update({
      where: { id: doc.id },
      data: {
        status: "COMPLETE",
        revisionId: ref.revisionId,
        lastEditedTime: ref.modifiedTime ? new Date(ref.modifiedTime) : null,
        lastSyncedAt: new Date(),
        lastError: null,
      },
    });

    return { documentId: doc.id, fileId: ref.externalId, title: ref.title, status: "imported", ...progress };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Import failed";

    // FAILED is never treated as up to date (that needs COMPLETE), so the next
    // attempt re-imports the document from the start.
    await prisma.sourceDocument.update({
      where: { id: doc.id },
      data: { status: "FAILED", lastError: message },
    });

    return {
      documentId: doc.id,
      fileId: ref.externalId,
      title: ref.title,
      status: "failed",
      cardsCreated: 0,
      sectionsDone: 0,
      sectionsTotal: 0,
      error: message,
    };
  }
}

/**
 * Continues an unfinished import by document id, whatever its source. Drive
 * documents are re-fetched through the normal path (which resumes). Uploads
 * have no source to re-fetch, so only their stored text can be continued.
 * Returns null when the document isn't the user's.
 */
export async function continueImport(
  userId: string,
  documentId: string,
  deadline: number = Date.now() + IMPORT_TIME_BUDGET_MS
): Promise<ImportOutcome | null> {
  const doc = await prisma.sourceDocument.findFirst({ where: { id: documentId, ownerId: userId } });
  if (!doc) return null;

  if (doc.provider === "GOOGLE_DRIVE") return importDocument(userId, doc.externalId, deadline);

  const ref: SourceRef = {
    provider: "UPLOAD",
    externalId: doc.externalId,
    revisionId: doc.revisionId,
    title: doc.title,
    mimeType: doc.mimeType ?? "text/plain",
  };

  if (doc.status !== "COMPLETE" && !resumePoint(doc, doc.revisionId)) {
    throw new Error("This upload can't be continued. Upload the file again.");
  }

  return importFromSource(
    userId,
    ref,
    async () => {
      // Unreachable: a COMPLETE upload returns "unchanged", and a resumable
      // one resumes from stored text without loading.
      throw new Error("Upload the file again.");
    },
    deadline
  );
}

async function processContent(
  userId: string,
  documentId: string,
  content: ImportContent,
  title: string,
  deadline: number
): Promise<SectionProgress> {
  if (content.kind === "rows") return importRows(userId, documentId, content.rows, title);
  return processText(userId, documentId, content.text, title, deadline, 0);
}

/** Prose: split on the learner's headings, generate per section, resumable. */
async function processText(
  userId: string,
  documentId: string,
  text: string,
  title: string,
  deadline: number,
  startFrom: number
): Promise<SectionProgress> {
  if (!text.trim()) {
    throw new Error("This document is empty.");
  }

  const { generable } = splitIntoSections(text, title);

  if (generable.length === 0) {
    throw new Error(
      "Couldn't find anything to make cards from. Documents work best with headings for each topic."
    );
  }

  const startAt = Math.min(startFrom, generable.length);

  if (startAt === 0) {
    await prisma.sourceDocument.update({
      where: { id: documentId },
      data: { rawMarkdown: text, sectionsTotal: generable.length },
    });
  }

  let cardsCreated = 0;
  let sectionsDone = startAt;
  const failures: string[] = [];

  for (const section of generable.slice(startAt)) {
    // Always make some progress per call, then stop once time is up so the
    // request ends cleanly rather than being killed by the platform.
    if (sectionsDone > startAt && Date.now() > deadline) {
      return { cardsCreated, sectionsDone, sectionsTotal: generable.length, remaining: true };
    }

    try {
      const { cards } = await generateCards({
        rawMarkdown: section.body,
        sourceDocumentTitle: sectionTitle(section),
      });
      cardsCreated += await persistCards(userId, documentId, cards);
    } catch (err) {
      // One bad section must not discard the rest of a long document.
      console.error(`Card generation failed for section "${sectionTitle(section)}"`, err);
      failures.push(sectionTitle(section));
    }

    sectionsDone += 1;
    await prisma.sourceDocument.update({ where: { id: documentId }, data: { sectionsDone } });
  }

  // Every section of this run failing means something systemic — an outage or
  // an exhausted quota — not a quirk of the notes.
  if (failures.length > 0 && failures.length === generable.length - startAt) {
    throw new Error("Card generation is unavailable right now. Try again shortly.");
  }

  return { cardsCreated, sectionsDone, sectionsTotal: generable.length };
}

/** Rows: map columns directly, falling back to the model. */
async function importRows(
  userId: string,
  documentId: string,
  rows: string[][],
  title: string
): Promise<SectionProgress> {
  if (rows.length === 0) {
    throw new Error("This spreadsheet is empty.");
  }

  const asText = rowsToMarkdown(rows);
  await prisma.sourceDocument.update({
    where: { id: documentId },
    data: { rawMarkdown: asText, sectionsTotal: 1 },
  });

  const detection = detectColumns(rows);

  // A recognisable vocabulary sheet is already a deck; mapping it directly
  // costs nothing and preserves exactly what the learner wrote.
  const cards: GeneratedCard[] = detection.mappable
    ? buildCardsFromRows(rows, detection, { defaultTopic: title })
    : (
        await generateCards({
          // The AI service caps input size; a huge unmapped sheet is cut
          // rather than rejected outright.
          rawMarkdown: asText.slice(0, MAX_NOTES_CHARS),
          sourceDocumentTitle: title,
        })
      ).cards;

  const cardsCreated = await persistCards(userId, documentId, cards);

  await prisma.sourceDocument.update({ where: { id: documentId }, data: { sectionsDone: 1 } });

  return { cardsCreated, sectionsDone: 1, sectionsTotal: 1 };
}

function sectionTitle(section: Section): string {
  return section.part ? `${section.title} (part ${section.part})` : section.title;
}

/**
 * Writes one section's cards, reusing topics and skipping duplicates.
 *
 * De-duplication is by prompt within the user's deck, which is what makes
 * re-importing an edited document extend the deck rather than double it.
 */
async function persistCards(
  userId: string,
  documentId: string,
  cards: GeneratedCard[]
): Promise<number> {
  let created = 0;

  for (const card of cards) {
    const topic = await prisma.topic.upsert({
      where: { ownerId_name: { ownerId: userId, name: card.topicName } },
      create: {
        name: card.topicName,
        pattern: card.topicPattern,
        ownerId: userId,
        sourceDocumentId: documentId,
      },
      update: { pattern: card.topicPattern ?? undefined },
    });

    const duplicate = await prisma.card.findFirst({
      where: { ownerId: userId, prompt: card.prompt },
      select: { id: true },
    });
    if (duplicate) continue;

    await prisma.card.create({
      data: {
        type: card.type,
        prompt: card.prompt,
        answer: card.answer,
        explanation: card.explanation,
        hints: card.hints ?? [],
        sourceText: card.sourceText,
        topicId: topic.id,
        ownerId: userId,
        isTemplate: false,
      },
    });
    created += 1;
  }

  return created;
}
