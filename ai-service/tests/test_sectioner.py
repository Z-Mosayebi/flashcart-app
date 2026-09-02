"""
Tests for document sectioning.

These run without a model key or network access: sectioning is pure text
handling, and keeping it testable in isolation is why it lives apart from
card generation.
"""

from app.services.sectioner import (
    MAX_SECTION_CHARS,
    MIN_SECTION_CHARS,
    split_into_sections,
)


def _body(chars: int, filler: str = "Beispielsatz. ") -> str:
    return (filler * (chars // len(filler) + 1))[:chars]


def test_splits_on_headings():
    doc = f"""### Dativ mit fehlen
{_body(400, "Fehlt dir etwas? ")}

### Konjunktiv II
{_body(400, "Ich haette gern. ")}
"""
    result = split_into_sections(doc)

    assert [s.title for s in result.generable] == ["Dativ mit fehlen", "Konjunktiv II"]


def test_heading_emphasis_is_stripped_from_titles():
    """Drive exports headings with markdown emphasis baked in."""
    doc = f"### **fehlen (+ Dativ)**\n{_body(400)}"

    assert split_into_sections(doc).generable[0].title == "fehlen (+ Dativ)"


def test_deep_headings_stay_inside_their_section():
    """A heading deeper than the section level enumerates points in a lesson."""
    doc = f"""### Passiv mit worden
{_body(300)}

##### 1. Beispiele
{_body(300)}
"""
    result = split_into_sections(doc)

    assert len(result.generable) == 1
    assert "1. Beispiele" in result.generable[0].body


def test_alphabetical_index_buckets_are_skipped_as_reference():
    """An A-Z vocabulary index restates material the lesson sections explain."""
    doc = f"""### A
{_body(400, "abheben, ankommen. ")}

### B
{_body(400, "begegnen, bestellen. ")}

### fehlen (+ Dativ)
{_body(400, "Fehlt dir etwas? ")}
"""
    result = split_into_sections(doc)

    assert [s.title for s in result.generable] == ["fehlen (+ Dativ)"]
    assert {s.skip_reason for s in result.skipped} == {"reference"}


def test_titled_index_section_is_skipped():
    doc = f"""## Wortschatz-Index (A-Z)
{_body(800)}

### Konjunktiv II
{_body(400)}
"""
    result = split_into_sections(doc)

    assert [s.title for s in result.generable] == ["Konjunktiv II"]


def test_short_sections_are_skipped():
    doc = f"""### Zu kurz
{_body(MIN_SECTION_CHARS - 50, "Kurzer Text. ")}

### Lang genug
{_body(MIN_SECTION_CHARS + 200, "Langer Text. ")}
"""
    result = split_into_sections(doc)

    assert [s.title for s in result.generable] == ["Lang genug"]
    assert result.skipped[0].skip_reason == "too_short"


def test_duplicate_sections_are_generated_once():
    """Copy-pasted notes must not spend a second model call on the same text."""
    repeated = _body(400)
    doc = f"### lassen\n{repeated}\n\n### lassen\n{repeated}\n"

    result = split_into_sections(doc)

    assert len(result.generable) == 1
    assert result.skipped[0].skip_reason == "duplicate"


def test_oversized_section_is_split_into_parts():
    paragraphs = "\n\n".join(_body(1_000) for _ in range(10))
    doc = f"### Leseverstehen B2\n{paragraphs}"

    result = split_into_sections(doc)

    assert len(result.generable) > 1
    assert all(s.char_count <= MAX_SECTION_CHARS for s in result.generable)
    # Parts stay attributable to the section they came from.
    assert all(s.title == "Leseverstehen B2" for s in result.generable)
    assert result.generable[0].display_title == "Leseverstehen B2 (part 1)"


def test_oversized_section_splits_on_paragraph_boundaries():
    """Cards cite source snippets, so a split must not cut mid-sentence."""
    paragraphs = [f"Absatz {i}. {_body(900)}" for i in range(10)]
    doc = "### Lang\n" + "\n\n".join(paragraphs)

    for section in split_into_sections(doc).generable:
        assert not section.body.startswith("Beispielsatz. Absatz")


def test_content_before_the_first_heading_becomes_a_section():
    doc = f"{_body(400)}\n\n### Erste Überschrift\n{_body(400)}"

    result = split_into_sections(doc, document_title="Meine Notizen")

    assert result.generable[0].title == "Meine Notizen"


def test_every_section_is_accounted_for():
    """Skips are reported, never silently dropped — the import UI shows them."""
    doc = f"""### A
{_body(300, "abheben, ankommen. ")}

### Kurz
{_body(50, "Kurz. ")}

### Echte Lektion
{_body(400, "Fehlt dir etwas? ")}
"""
    result = split_into_sections(doc)

    assert len(result.sections) == 3
    assert len(result.generable) + len(result.skipped) == len(result.sections)
    assert all(s.skip_reason for s in result.skipped)


def test_persian_and_german_content_survives_intact():
    """Notes mix German with Persian glosses; extraction must not mangle them."""
    doc = "### fehlen (+ Dativ)\n" + "**fehlen** — کم بودن، جای خالی داشتن\n" * 30

    section = split_into_sections(doc).generable[0]

    assert "کم بودن" in section.body
    assert "fehlen" in section.body


def test_empty_document_produces_no_sections():
    assert split_into_sections("").sections == []
