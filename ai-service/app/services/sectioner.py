"""
Splits a long notes document into sections small enough to generate cards from.

A real learner's notes document runs to ~100k characters — far beyond what one
model call can handle, and far beyond what fits in an HTTP request timeout. It
also produces worse cards: a model given fifty pages writes shallow, scattered
cards, while a model given one focused lesson writes sharp ones.

So the document is split before generation, and each section becomes its own
generation call. Splitting on the learner's own headings is deliberate: those
headings are how they already organise their study, so the resulting topics
match the way they think about the material rather than an arbitrary word count.

Three realities of actual notes shape the logic here:

  1. Not every section is teachable. A vocabulary index is a lookup table the
     learner built for themselves — real content, but already-known content,
     and generating cards from it duplicates the sections it points at.
  2. Sections vary hugely in size. Most are 2-6k characters; a transcript or
     reading-comprehension dump can be 14k. Oversized sections are split again.
  3. Notes get copy-pasted. Identical sections appear twice, and generating
     both burns quota to produce duplicate cards.
"""

from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass, field

# Sections larger than this are split again before generation. Set from observed
# behaviour rather than a token limit: past roughly this size the model starts
# skimming, and card quality falls off before any hard limit is reached.
MAX_SECTION_CHARS = 6_000

# Below this a section cannot carry a worthwhile card on its own, so it is
# merged into its predecessor rather than spending a model call.
MIN_SECTION_CHARS = 200

# Headings at this level or shallower start a new section. Deeper headings are
# treated as content, since they usually enumerate points within one lesson.
SECTION_HEADING_LEVEL = 3

_HEADING_RE = re.compile(r"^(#{1,6})\s+(.*)$")

# A heading whose text is a single letter (or letter pair) is an alphabetical
# index bucket, not a lesson. These carry no teachable structure of their own —
# the material they list is explained in the lesson sections.
_INDEX_HEADING_RE = re.compile(r"^[A-ZÄÖÜ]{1,2}$")

# Titles that announce a section as reference material rather than a lesson.
_REFERENCE_TITLE_HINTS = (
    "wortschatz-index",
    "index",
    "inhaltsverzeichnis",
    "table of contents",
    "glossar",
    "glossary",
)


@dataclass
class Section:
    """One generation unit: a titled slice of the document."""

    title: str
    body: str
    level: int
    # Set when a single oversized section was split into several parts, so the
    # titles stay distinguishable ("Bank & Geld (part 2)").
    part: int | None = None
    # Why this section will not be sent for generation, or None if it will be.
    skip_reason: str | None = None

    @property
    def display_title(self) -> str:
        if self.part is None:
            return self.title
        return f"{self.title} (part {self.part})"

    @property
    def char_count(self) -> int:
        return len(self.body)

    @property
    def is_generable(self) -> bool:
        return self.skip_reason is None


@dataclass
class SectioningResult:
    sections: list[Section] = field(default_factory=list)

    @property
    def generable(self) -> list[Section]:
        return [s for s in self.sections if s.is_generable]

    @property
    def skipped(self) -> list[Section]:
        return [s for s in self.sections if not s.is_generable]


def _clean_title(raw: str) -> str:
    """Strips markdown emphasis and stray symbols from a heading."""
    text = re.sub(r"[*_`]", "", raw).strip()
    # Drive's text export renders some inline icons as replacement characters;
    # they carry no meaning in a title.
    text = re.sub(r"[�ð]", "", text)
    return re.sub(r"\s+", " ", text).strip()


def _is_reference_section(title: str) -> bool:
    """True for lookup material: an A-Z index bucket or a titled index."""
    if _INDEX_HEADING_RE.match(title):
        return True
    lowered = title.lower()
    return any(hint in lowered for hint in _REFERENCE_TITLE_HINTS)


def _split_oversized(section: Section) -> list[Section]:
    """
    Breaks a too-large section into parts on paragraph boundaries.

    Splitting on blank lines rather than a character count keeps example
    sentences and their explanations together, which is what makes a card
    traceable back to a coherent snippet of the notes.
    """
    paragraphs = re.split(r"\n\s*\n", section.body)

    parts: list[str] = []
    current: list[str] = []
    size = 0

    for para in paragraphs:
        para_size = len(para)
        # A single paragraph over the limit has no internal boundary to use;
        # it goes through whole rather than being cut mid-sentence.
        if current and size + para_size > MAX_SECTION_CHARS:
            parts.append("\n\n".join(current))
            current, size = [], 0
        current.append(para)
        size += para_size + 2

    if current:
        parts.append("\n\n".join(current))

    if len(parts) == 1:
        return [section]

    return [
        Section(title=section.title, body=body, level=section.level, part=i + 1)
        for i, body in enumerate(parts)
    ]


def split_into_sections(markdown: str, *, document_title: str = "") -> SectioningResult:
    """
    Splits a document into generation-sized sections.

    Every section of the document is returned, including ones that will not be
    generated from — each carries a `skip_reason` explaining why. Reporting the
    skips rather than silently dropping them is what lets the import UI tell a
    learner "40 sections, 29 generated, 11 reference" instead of quietly
    processing part of their notes.
    """
    lines = markdown.split("\n")

    raw_sections: list[Section] = []
    preamble: list[str] = []
    current: Section | None = None

    for line in lines:
        match = _HEADING_RE.match(line)
        level = len(match.group(1)) if match else 0

        if match and level <= SECTION_HEADING_LEVEL:
            title = _clean_title(match.group(2))
            # A heading with no text is a formatting artefact, not a boundary.
            if title:
                current = Section(title=title, body="", level=level)
                raw_sections.append(current)
                continue

        if current is None:
            preamble.append(line)
        else:
            current.body += line + "\n"

    # Content before the first heading is a section in its own right — some
    # documents open with material and only start using headings later.
    leading = "\n".join(preamble).strip()
    if leading:
        raw_sections.insert(
            0, Section(title=document_title or "Introduction", body=leading, level=1)
        )

    result = SectioningResult()
    seen_hashes: dict[str, str] = {}

    for section in raw_sections:
        section.body = section.body.strip()

        if _is_reference_section(section.title):
            section.skip_reason = "reference"
            result.sections.append(section)
            continue

        if section.char_count < MIN_SECTION_CHARS:
            section.skip_reason = "too_short"
            result.sections.append(section)
            continue

        # Notes get copy-pasted; identical bodies would produce identical cards
        # at full model cost, so the repeat is recorded and skipped.
        digest = hashlib.sha256(section.body.encode("utf-8")).hexdigest()
        if digest in seen_hashes:
            section.skip_reason = "duplicate"
            result.sections.append(section)
            continue
        seen_hashes[digest] = section.title

        if section.char_count > MAX_SECTION_CHARS:
            result.sections.extend(_split_oversized(section))
        else:
            result.sections.append(section)

    return result
