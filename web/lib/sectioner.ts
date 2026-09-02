/**
 * Splits a long notes document into sections small enough to generate from.
 *
 * This mirrors ai-service/app/services/sectioner.py, which is the reference
 * implementation and carries the full rationale. The logic is duplicated rather
 * than shared because the two tiers need it at different moments: the web tier
 * splits before dispatching per-section generation calls (so it can report
 * progress and survive a restart), while the Python service keeps its copy for
 * the batch path. Keeping both means neither tier has to call the other just to
 * count sections.
 *
 * If you change the rules here, change them there too — the tests in
 * ai-service/tests/test_sectioner.py define the expected behaviour.
 */

/**
 * Sections larger than this are split again. Set from observed behaviour rather
 * than a token limit: past roughly this size the model starts skimming, and
 * card quality falls off before any hard limit is reached.
 */
const MAX_SECTION_CHARS = 6_000;

/** Below this a section cannot carry a worthwhile card of its own. */
const MIN_SECTION_CHARS = 200;

/** Headings at this level or shallower start a new section. */
const SECTION_HEADING_LEVEL = 3;

const HEADING_RE = /^(#{1,6})\s+(.*)$/;

/** A single-letter heading is an alphabetical index bucket, not a lesson. */
const INDEX_HEADING_RE = /^[A-ZÄÖÜ]{1,2}$/;

const REFERENCE_TITLE_HINTS = [
  "wortschatz-index",
  "index",
  "inhaltsverzeichnis",
  "table of contents",
  "glossar",
  "glossary",
];

export type SkipReason = "reference" | "too_short" | "duplicate";

export interface Section {
  title: string;
  body: string;
  level: number;
  /** Set when an oversized section was split, so parts stay distinguishable. */
  part?: number;
  /** Why this section will not be generated from, or undefined if it will be. */
  skipReason?: SkipReason;
}

export interface SectioningResult {
  sections: Section[];
  generable: Section[];
  skipped: Section[];
}

function cleanTitle(raw: string): string {
  return raw
    .replace(/[*_`]/g, "")
    // Drive's text export renders some inline icons as replacement characters.
    .replace(/[�ð]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isReferenceSection(title: string): boolean {
  if (INDEX_HEADING_RE.test(title)) return true;
  const lowered = title.toLowerCase();
  return REFERENCE_TITLE_HINTS.some((hint) => lowered.includes(hint));
}

/**
 * Splits on paragraph boundaries rather than a character count, so example
 * sentences stay with the explanation that makes them teachable.
 */
function splitOversized(section: Section): Section[] {
  const paragraphs = section.body.split(/\n\s*\n/);

  const parts: string[] = [];
  let current: string[] = [];
  let size = 0;

  for (const para of paragraphs) {
    if (current.length > 0 && size + para.length > MAX_SECTION_CHARS) {
      parts.push(current.join("\n\n"));
      current = [];
      size = 0;
    }
    current.push(para);
    size += para.length + 2;
  }
  if (current.length > 0) parts.push(current.join("\n\n"));

  if (parts.length === 1) return [section];

  return parts.map((body, i) => ({
    title: section.title,
    body,
    level: section.level,
    part: i + 1,
  }));
}

/**
 * Splits a document into generation-sized sections.
 *
 * Every section is returned, including skipped ones — each carries a
 * `skipReason`. Reporting skips rather than dropping them is what lets the
 * import tell a learner "40 sections, 29 generated, 11 reference" instead of
 * quietly processing part of their notes.
 */
export function splitIntoSections(markdown: string, documentTitle = ""): SectioningResult {
  const lines = markdown.split("\n");

  const raw: Section[] = [];
  const preamble: string[] = [];
  let current: Section | null = null;

  for (const line of lines) {
    const match = line.match(HEADING_RE);
    const level = match ? match[1].length : 0;

    if (match && level <= SECTION_HEADING_LEVEL) {
      const title = cleanTitle(match[2]);
      // A heading with no text is a formatting artefact, not a boundary.
      if (title) {
        current = { title, body: "", level };
        raw.push(current);
        continue;
      }
    }

    if (current === null) preamble.push(line);
    else current.body += line + "\n";
  }

  // Content before the first heading is a section in its own right.
  const leading = preamble.join("\n").trim();
  if (leading) {
    raw.unshift({ title: documentTitle || "Introduction", body: leading, level: 1 });
  }

  const sections: Section[] = [];
  const seen = new Set<string>();

  for (const section of raw) {
    section.body = section.body.trim();

    if (isReferenceSection(section.title)) {
      sections.push({ ...section, skipReason: "reference" });
      continue;
    }

    if (section.body.length < MIN_SECTION_CHARS) {
      sections.push({ ...section, skipReason: "too_short" });
      continue;
    }

    // Notes get copy-pasted; an identical body would cost a model call to
    // produce cards that already exist.
    if (seen.has(section.body)) {
      sections.push({ ...section, skipReason: "duplicate" });
      continue;
    }
    seen.add(section.body);

    if (section.body.length > MAX_SECTION_CHARS) {
      sections.push(...splitOversized(section));
    } else {
      sections.push(section);
    }
  }

  return {
    sections,
    generable: sections.filter((s) => !s.skipReason),
    skipped: sections.filter((s) => s.skipReason),
  };
}
