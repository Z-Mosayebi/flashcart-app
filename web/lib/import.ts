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
  fetchDocumentText,
  fetchSpreadsheetRows,
  getFileMetadata,
  isSpreadsheet,
  isSupported,
  unsupportedReason,
} from "@/lib/google-drive";
import {
  buildCardsFromRows,
  detectColumns,
  rowsToMarkdown,
} from "@/lib/spreadsheet-cards";
import { splitIntoSections, type Section } from "@/lib/sectioner";

/**
 * How long one request may spend generating before it hands back. The route's
 * maxDuration is 300s and a single section can take ~90s in the worst case
 * (45s timeout plus one retry), so no new section is started after 180s. That
 * keeps the request inside the platform limit instead of being killed mid-way.
 */
export const IMPORT_TIME_BUDGET_MS = 180_000;

/** The AI service rejects notes longer than this. */
const MAX_NOTES_CHARS = 60_000;

export interface ImportOutcome {
  documentId: string;
  /** The Drive file id, so a client can ask to continue a partial import. */
  fileId: string;
  title: string;
  /** "partial": the time budget ran out; calling again continues where it stopped. */
  status: "unchanged" | "imported" | "partial" | "failed";
  cardsCreated: number;
  sectionsDone: number;
  sectionsTotal: number;
  error?: string;
}

interface SectionProgress {
  cardsCreated: number;
  sectionsDone: number;
  sectionsTotal: number;
  /** True when the deadline stopped the import before the last section. */
  remaining?: boolean;
}

/**
 * Imports one Drive document into a user's deck.
 *
 * Safe to call again on the same document: unchanged documents are skipped via
 * Drive's revision id, cards that already exist are not duplicated, and an
 * import that was interrupted (time budget, crash, platform timeout) resumes at
 * the section it reached rather than starting over.
 *
 * `deadline` (epoch ms) bounds how long this call keeps generating; past it the
 * document is left PENDING and the outcome is "partial".
 */
export async function importDocument(
  userId: string,
  fileId: string,
  deadline: number = Date.now() + IMPORT_TIME_BUDGET_MS
): Promise<ImportOutcome> {
  const meta = await getFileMetadata(userId, fileId);

  if (!isSupported(meta.mimeType)) {
    throw new Error(unsupportedReason(meta.mimeType));
  }

  const existing = await prisma.sourceDocument.findUnique({
    where: {
      ownerId_provider_externalId: {
        ownerId: userId,
        provider: "GOOGLE_DRIVE",
        externalId: fileId,
      },
    },
  });

  // Drive's revision id changes only when content does, unlike modifiedTime,
  // which moves when a file is merely opened or re-shared. Using it is what
  // keeps a daily re-import from regenerating an untouched deck.
  const unchanged =
    existing?.status === "COMPLETE" &&
    existing.revisionId != null &&
    existing.revisionId === meta.revisionId;

  if (unchanged) {
    return {
      documentId: existing.id,
      fileId,
      title: existing.title,
      status: "unchanged",
      cardsCreated: 0,
      sectionsDone: existing.sectionsDone,
      sectionsTotal: existing.sectionsTotal,
    };
  }

  // An interrupted import of the same revision picks up where it stopped. The
  // stored text is reused so the sections line up with the saved position.
  const resume =
    existing != null &&
    (existing.status === "IMPORTING" || existing.status === "PENDING") &&
    existing.revisionId != null &&
    existing.revisionId === meta.revisionId &&
    !isSpreadsheet(meta.mimeType) &&
    existing.rawMarkdown.length > 0 &&
    existing.sectionsTotal > 0 &&
    existing.sectionsDone < existing.sectionsTotal
      ? { text: existing.rawMarkdown, from: existing.sectionsDone }
      : undefined;

  const doc = await prisma.sourceDocument.upsert({
    where: {
      ownerId_provider_externalId: {
        ownerId: userId,
        provider: "GOOGLE_DRIVE",
        externalId: fileId,
      },
    },
    create: {
      provider: "GOOGLE_DRIVE",
      externalId: fileId,
      title: meta.name,
      rawMarkdown: "",
      mimeType: meta.mimeType,
      ownerId: userId,
      status: "IMPORTING",
      // Recorded up front so an interrupted import can tell whether the
      // document changed before resuming. It only marks the document up to
      // date together with status COMPLETE, so a partial import is never skipped.
      revisionId: meta.revisionId,
    },
    update: resume
      ? { status: "IMPORTING", lastError: null }
      : {
          title: meta.name,
          mimeType: meta.mimeType,
          status: "IMPORTING",
          revisionId: meta.revisionId,
          sectionsDone: 0,
          sectionsTotal: 0,
          lastError: null,
        },
  });

  try {
    const outcome = isSpreadsheet(meta.mimeType)
      ? await importSpreadsheet(userId, doc.id, fileId, meta.mimeType, meta.name)
      : await importProse(userId, doc.id, fileId, meta.mimeType, meta.name, { deadline, resume });

    const progress = {
      cardsCreated: outcome.cardsCreated,
      sectionsDone: outcome.sectionsDone,
      sectionsTotal: outcome.sectionsTotal,
    };

    if (outcome.remaining) {
      // Out of time, not out of work: leave it resumable for the next call.
      await prisma.sourceDocument.update({
        where: { id: doc.id },
        data: { status: "PENDING" },
      });
      return { documentId: doc.id, fileId, title: meta.name, status: "partial", ...progress };
    }

    await prisma.sourceDocument.update({
      where: { id: doc.id },
      data: {
        status: "COMPLETE",
        revisionId: meta.revisionId,
        lastEditedTime: meta.modifiedTime ? new Date(meta.modifiedTime) : null,
        lastSyncedAt: new Date(),
        lastError: null,
      },
    });

    return { documentId: doc.id, fileId, title: meta.name, status: "imported", ...progress };
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
      fileId,
      title: meta.name,
      status: "failed",
      cardsCreated: 0,
      sectionsDone: 0,
      sectionsTotal: 0,
      error: message,
    };
  }
}

/** Prose path: split on the learner's headings, generate per section. */
async function importProse(
  userId: string,
  documentId: string,
  fileId: string,
  mimeType: string,
  title: string,
  opts: { deadline: number; resume?: { text: string; from: number } }
): Promise<SectionProgress> {
  const text = opts.resume?.text ?? (await fetchDocumentText(userId, fileId, mimeType));

  if (!text.trim()) {
    throw new Error("This document is empty.");
  }

  const { generable } = splitIntoSections(text, title);

  if (generable.length === 0) {
    throw new Error(
      "Couldn't find anything to make cards from. Documents work best with headings for each topic."
    );
  }

  const startAt = opts.resume ? Math.min(opts.resume.from, generable.length) : 0;

  if (!opts.resume) {
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
    if (sectionsDone > startAt && Date.now() > opts.deadline) {
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
    await prisma.sourceDocument.update({
      where: { id: documentId },
      data: { sectionsDone },
    });
  }

  // Every section of this run failing means something systemic — an outage or
  // an exhausted quota — not a quirk of the notes, so it is surfaced rather
  // than reported as a successful import of nothing.
  if (failures.length > 0 && failures.length === generable.length - startAt) {
    throw new Error("Card generation is unavailable right now. Try again shortly.");
  }

  return { cardsCreated, sectionsDone, sectionsTotal: generable.length };
}

/** Spreadsheet path: map columns directly, falling back to the model. */
async function importSpreadsheet(
  userId: string,
  documentId: string,
  fileId: string,
  mimeType: string,
  title: string
): Promise<SectionProgress> {
  const rows = await fetchSpreadsheetRows(userId, fileId, mimeType);

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
  const cards = detection.mappable
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

  await prisma.sourceDocument.update({
    where: { id: documentId },
    data: { sectionsDone: 1 },
  });

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
