"""
Offline card-generation trial — inspect card quality before building any UI.

This runs the real sectioner and the real model against a real notes document
and writes the resulting cards to a file for reading. It touches no database,
no OAuth and no web tier, so the output can be judged on its own before the
import pipeline is built around it.

Input is a plain-text or markdown export of a notes document. Getting one from
Drive by hand while the connected flow does not exist yet:

    File -> Download -> Plain text (.txt)   in Google Docs

Usage:
    python scripts/try_generate.py notes.txt
    python scripts/try_generate.py notes.txt --limit 3      # first 3 sections
    python scripts/try_generate.py notes.txt --dry-run      # sectioning only
    python scripts/try_generate.py notes.txt --out cards.json

Requires (same as the AI service):
    GEMINI_API_KEY, or LLM_PROVIDER=anthropic with ANTHROPIC_API_KEY.
    Read from ai-service/.env automatically.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
AI_SERVICE = REPO_ROOT / "ai-service"

# Import the service's own modules rather than reimplementing them: the point of
# this script is to judge what the real pipeline produces.
sys.path.insert(0, str(AI_SERVICE))

from dotenv import load_dotenv  # noqa: E402

load_dotenv(AI_SERVICE / ".env")

from app.services.card_generator import generate_cards_from_notes  # noqa: E402
from app.services.sectioner import split_into_sections  # noqa: E402

# The free Gemini tier allows roughly 15 requests/minute. Pausing between
# sections keeps a long document from tripping it partway through.
PAUSE_BETWEEN_SECTIONS_S = 4.5


def _print_plan(result, path: Path) -> None:
    print(f"\nDocument: {path.name}")
    print(f"  {len(result.sections)} sections found")
    print(f"  {len(result.generable)} to generate from")
    print(f"  {len(result.skipped)} skipped\n")

    for section in result.generable:
        print(f"  {section.char_count:6,}  {section.display_title[:70]}")

    if result.skipped:
        print("\n  Skipped:")
        by_reason: dict[str, list[str]] = {}
        for section in result.skipped:
            by_reason.setdefault(section.skip_reason, []).append(section.title)
        for reason, titles in sorted(by_reason.items()):
            shown = ", ".join(t[:28] for t in titles[:6])
            more = f" (+{len(titles) - 6} more)" if len(titles) > 6 else ""
            print(f"    {reason:<12} {len(titles):3}  {shown}{more}")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("path", type=Path, help="Text/markdown export of the notes")
    parser.add_argument("--limit", type=int, help="Only process the first N sections")
    parser.add_argument("--dry-run", action="store_true", help="Section only, no model calls")
    parser.add_argument("--out", type=Path, help="Write cards as JSON here")
    args = parser.parse_args()

    if not args.path.exists():
        print(f"No such file: {args.path}", file=sys.stderr)
        return 1

    markdown = args.path.read_text(encoding="utf-8")
    result = split_into_sections(markdown, document_title=args.path.stem)
    _print_plan(result, args.path)

    if args.dry_run:
        return 0

    sections = result.generable[: args.limit] if args.limit else result.generable
    if not sections:
        print("\nNothing to generate from.")
        return 0

    print(f"\nGenerating from {len(sections)} sections...\n")

    all_cards: list[dict] = []
    failures: list[tuple[str, str]] = []
    started = time.monotonic()

    for i, section in enumerate(sections, 1):
        label = section.display_title[:52]
        print(f"  [{i}/{len(sections)}] {label:<54}", end="", flush=True)

        try:
            response = generate_cards_from_notes(section.body, section.display_title)
        except Exception as exc:  # noqa: BLE001 - a bad section must not end the run
            print(f"FAILED  {str(exc)[:60]}")
            failures.append((section.display_title, str(exc)))
            continue

        cards = [c.model_dump(by_alias=True) for c in response.cards]
        for card in cards:
            card["_section"] = section.display_title
        all_cards.extend(cards)
        print(f"{len(cards):3} cards")

        if i < len(sections):
            time.sleep(PAUSE_BETWEEN_SECTIONS_S)

    elapsed = time.monotonic() - started

    print(f"\n{len(all_cards)} cards from {len(sections) - len(failures)} sections "
          f"in {elapsed / 60:.1f} min")

    if failures:
        print(f"\n{len(failures)} section(s) failed:")
        for title, error in failures:
            print(f"  {title[:40]:<42} {error[:70]}")

    if all_cards:
        by_type: dict[str, int] = {}
        topics = set()
        for card in all_cards:
            by_type[card["type"]] = by_type.get(card["type"], 0) + 1
            topics.add(card["topicName"])
        print(f"\nCard types: " + ", ".join(f"{t}={n}" for t, n in sorted(by_type.items())))
        print(f"Topics: {len(topics)}")

    out = args.out or REPO_ROOT / "scripts" / "generated_cards.json"
    out.write_text(json.dumps(all_cards, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\nWritten to {out}")

    return 1 if failures and not all_cards else 0


if __name__ == "__main__":
    raise SystemExit(main())
