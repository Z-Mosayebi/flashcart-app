/**
 * Turns a vocabulary spreadsheet into cards without calling a model.
 *
 * A vocabulary sheet is already a deck: the learner has done the work of
 * pairing a German term with its meaning. Sending that to a model would be
 * slower, would consume quota, and would risk paraphrasing what the learner
 * deliberately wrote. So a recognisable sheet is mapped directly, and the
 * model is reserved for prose, which is where it earns its cost.
 *
 * Sheets that don't fit a recognisable layout fall back to model generation —
 * detection failing must never mean the import fails.
 */

import type { GeneratedCard } from "@/lib/ai";

/** What a column contributes to a card. */
export type ColumnRole = "term" | "meaning" | "example" | "topic" | "ignore";

export interface ColumnMapping {
  index: number;
  header: string;
  role: ColumnRole;
}

/**
 * Header keywords by role, in English, German and Persian — the three
 * languages this product's learners actually label their columns in.
 *
 * Order matters within a role: more specific terms first, so "Beispielsatz"
 * is read as an example rather than matching a looser rule.
 */
const HEADER_HINTS: Record<Exclude<ColumnRole, "ignore">, string[]> = {
  term: [
    "german", "deutsch", "wort", "word", "term", "begriff", "vokabel",
    "ausdruck", "آلمانی", "کلمه", "واژه", "لغت",
  ],
  meaning: [
    "meaning", "translation", "bedeutung", "übersetzung", "ubersetzung",
    "english", "englisch", "persian", "persisch", "farsi", "definition",
    "معنی", "معني", "ترجمه", "فارسی", "معادل",
  ],
  example: [
    "example sentence", "beispielsatz", "example", "beispiel", "satz",
    "sentence", "usage", "kontext", "context", "مثال", "جمله", "نمونه",
  ],
  topic: [
    "topic", "thema", "category", "kategorie", "grammar", "grammatik",
    "lesson", "lektion", "chapter", "kapitel", "موضوع", "دسته", "درس",
  ],
};

function roleForHeader(header: string): ColumnRole {
  const normalized = header.trim().toLowerCase();
  if (!normalized) return "ignore";

  // Examples are checked before terms: a header like "Beispielsatz" contains
  // no term keyword, but "Wort im Satz" contains both, and it is an example.
  for (const role of ["example", "topic", "meaning", "term"] as const) {
    if (HEADER_HINTS[role].some((hint) => normalized.includes(hint))) {
      return role;
    }
  }
  return "ignore";
}

/**
 * True when a row looks like column labels rather than data.
 *
 * Sheets often start straight into data with no header. Guessing wrong in that
 * direction silently eats the learner's first vocabulary pair, so a header is
 * only accepted when at least one cell actually matches a known label.
 */
function looksLikeHeader(row: string[]): boolean {
  return row.some((cell) => roleForHeader(cell) !== "ignore");
}

export interface SheetDetection {
  /** True when the sheet can be mapped without a model. */
  mappable: boolean;
  hasHeaderRow: boolean;
  columns: ColumnMapping[];
  rowCount: number;
  /** Set when `mappable` is false, explaining what to do instead. */
  reason?: string;
}

/**
 * Works out what each column is for.
 *
 * The result is returned for confirmation rather than applied: a wrong guess
 * about which column is the answer produces a deck of backwards cards, and the
 * learner is the only one who can catch that before it happens.
 */
export function detectColumns(rows: string[][]): SheetDetection {
  const nonEmpty = rows.filter((row) => row.some((cell) => (cell ?? "").trim()));

  if (nonEmpty.length === 0) {
    return { mappable: false, hasHeaderRow: false, columns: [], rowCount: 0, reason: "This sheet is empty." };
  }

  const hasHeaderRow = looksLikeHeader(nonEmpty[0]);
  const dataRows = hasHeaderRow ? nonEmpty.slice(1) : nonEmpty;

  if (dataRows.length === 0) {
    return {
      mappable: false,
      hasHeaderRow,
      columns: [],
      rowCount: 0,
      reason: "This sheet has headers but no rows.",
    };
  }

  const width = Math.max(...nonEmpty.map((r) => r.length));

  let columns: ColumnMapping[];

  if (hasHeaderRow) {
    columns = Array.from({ length: width }, (_, i) => ({
      index: i,
      header: (nonEmpty[0][i] ?? "").trim(),
      role: roleForHeader(nonEmpty[0][i] ?? ""),
    }));
  } else if (width === 2) {
    // No header to read. The two-column convention (term, then meaning) is
    // near-universal for vocabulary lists, so it is worth guessing — but only
    // at exactly two columns. A wider sheet with no recognisable headers is
    // more likely to be notes than a vocabulary list, and guessing there would
    // silently turn arbitrary text into backwards cards.
    columns = [
      { index: 0, header: "Column 1", role: "term" },
      { index: 1, header: "Column 2", role: "meaning" },
    ];
  } else {
    columns = Array.from({ length: width }, (_, i) => ({
      index: i,
      header: `Column ${i + 1}`,
      role: "ignore" as ColumnRole,
    }));
  }

  const hasTerm = columns.some((c) => c.role === "term");
  const hasMeaning = columns.some((c) => c.role === "meaning");

  if (!hasTerm || !hasMeaning) {
    return {
      mappable: false,
      hasHeaderRow,
      columns,
      rowCount: dataRows.length,
      reason:
        "Couldn't tell which columns hold the German term and its meaning. " +
        "Flashcard will read this sheet as notes instead.",
    };
  }

  return { mappable: true, hasHeaderRow, columns, rowCount: dataRows.length };
}

/**
 * Builds cards from rows using a confirmed column mapping.
 *
 * Two cards per row, in both directions: recognising a German word and
 * producing it are different skills, and producing it is the one this product
 * exists to train.
 */
export function buildCardsFromRows(
  rows: string[][],
  detection: SheetDetection,
  options: { defaultTopic?: string } = {}
): GeneratedCard[] {
  const dataRows = detection.hasHeaderRow ? rows.slice(1) : rows;
  const defaultTopic = options.defaultTopic?.trim() || "Vocabulary";

  const indexFor = (role: ColumnRole) =>
    detection.columns.find((c) => c.role === role)?.index ?? -1;

  const termIdx = indexFor("term");
  const meaningIdx = indexFor("meaning");
  const exampleIdx = indexFor("example");
  const topicIdx = indexFor("topic");

  const cell = (row: string[], i: number) => (i >= 0 ? (row[i] ?? "").trim() : "");

  const cards: GeneratedCard[] = [];

  for (const row of dataRows) {
    const term = cell(row, termIdx);
    const meaning = cell(row, meaningIdx);
    // A row missing either half cannot make a gradeable card; skipping it is
    // better than generating one whose answer is blank.
    if (!term || !meaning) continue;

    const example = cell(row, exampleIdx);
    const topicName = cell(row, topicIdx) || defaultTopic;
    const sourceText = example || `${term} — ${meaning}`;

    // Recognition: given the German, produce the meaning.
    cards.push({
      type: "VOCAB",
      topicName,
      prompt: `What does "${term}" mean?`,
      answer: meaning,
      explanation: example ? `Example: ${example}` : undefined,
      hints: [],
      sourceText,
    });

    // Production: given the meaning, produce the German. This is the direction
    // that trains recall rather than recognition.
    cards.push({
      type: "VOCAB",
      topicName,
      prompt: `How do you say "${meaning}" in German?`,
      answer: term,
      explanation: example ? `Example: ${example}` : undefined,
      hints: [],
      sourceText,
    });

    // An example sentence supports a cloze card, which is the only one of the
    // three that tests the word in context.
    const blanked = blankTermIn(example, term);
    if (blanked) {
      cards.push({
        type: "CLOZE",
        topicName,
        prompt: `Fill in the blank: ${blanked.sentence}`,
        // The answer is the form actually used in the sentence, not the
        // dictionary form — that is what the learner has to produce here.
        answer: blanked.matched,
        explanation: `From "${term}" — "${meaning}".`,
        hints: [],
        sourceText: example,
      });
    }
  }

  return cards;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

interface BlankedExample {
  /** The example with the term replaced by a blank. */
  sentence: string;
  /** The exact word form that was removed, which becomes the answer. */
  matched: string;
}

/**
 * Blanks out a term in its example sentence.
 *
 * Matching the term exactly is not enough, and failing to notice that would
 * quietly cost most rows their cloze card: notes list verbs as infinitives
 * ("fehlen") but use them conjugated in examples ("Fehlt dir etwas?"), and
 * nouns appear with articles and case endings.
 *
 * German inflection is suffixal, so the term's stem is matched instead, and
 * the answer becomes the inflected form actually present — which is the form
 * the learner needs to produce in that sentence anyway.
 *
 * Returns null when no form of the term appears, rather than guessing.
 */
function blankTermIn(example: string, term: string): BlankedExample | null {
  if (!example || !term) return null;

  // Multi-word terms ("in Verlegenheit geraten") and parenthesised annotations
  // ("auffallen (+ Dativ)") are matched on their first *significant* word —
  // skipping the articles, prepositions and reflexive pronouns that vocabulary
  // lists put in front of the word actually being learned.
  const head = term
    .replace(/\([^)]*\)/g, " ")
    .trim()
    .split(/\s+/)
    .find((word) => word.length >= 4);
  if (!head) return null;

  // Trimming two characters covers the common endings while keeping the stem
  // specific enough not to match an unrelated word.
  const stem = head.slice(0, Math.max(4, head.length - 2));
  const pattern = new RegExp(`\\b${escapeRegExp(stem)}\\w*`, "i");

  const match = example.match(pattern);
  if (!match) return null;

  return { sentence: example.replace(pattern, "_____"), matched: match[0] };
}

/**
 * Renders rows as text for the model, used when detection could not find a
 * usable layout. Keeps the grid readable so the model can still see pairings.
 */
export function rowsToMarkdown(rows: string[][]): string {
  return rows
    .filter((row) => row.some((cell) => (cell ?? "").trim()))
    .map((row) => row.map((cell) => (cell ?? "").trim()).join(" | "))
    .join("\n");
}
