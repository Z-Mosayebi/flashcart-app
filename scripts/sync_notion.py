"""
Notion -> Flashcart sync job.

Pulls one or more Notion pages via the official Notion API, diffs against
`SourceDocument.last_edited_time` in Postgres to skip unchanged pages, sends
new/changed page content through the AI service's /generate/cards endpoint,
and upserts the resulting cards/topics into the DB.

Run manually:
    python scripts/sync_notion.py

Run on a schedule (recommended for the "step by step, will be add more" requirement
in the brief — new Notion content becomes new flashcards automatically):
    - Vercel Cron -> hits a Next.js API route that shells out to this, OR
    - a simple cron / GitHub Actions scheduled workflow calling this script directly,
      since it needs NOTION_API_KEY, DATABASE_URL, and AI_SERVICE_URL as secrets.

Requires:
    pip install notion-client psycopg[binary] httpx python-dotenv
    NOTION_API_KEY   - Notion internal integration token (share your pages with it!)
    NOTION_PAGE_IDS  - comma-separated list of page IDs/URLs to sync
    DATABASE_URL     - same Postgres the Next.js app uses
    AI_SERVICE_URL   - the FastAPI service, e.g. http://localhost:8000
"""

from __future__ import annotations

import os
import sys
from datetime import datetime, timezone

import httpx
import psycopg
from dotenv import load_dotenv
from notion_client import Client as NotionClient

load_dotenv()

NOTION_API_KEY = os.environ.get("NOTION_API_KEY")
DATABASE_URL = os.environ.get("DATABASE_URL")
AI_SERVICE_URL = os.environ.get("AI_SERVICE_URL", "http://localhost:8000")
NOTION_PAGE_IDS = [p.strip() for p in os.environ.get("NOTION_PAGE_IDS", "").split(",") if p.strip()]


def require_env():
    missing = [
        name
        for name, val in [
            ("NOTION_API_KEY", NOTION_API_KEY),
            ("DATABASE_URL", DATABASE_URL),
            ("NOTION_PAGE_IDS", NOTION_PAGE_IDS or None),
        ]
        if not val
    ]
    if missing:
        print(f"Missing required env vars: {', '.join(missing)}. See scripts/.env.example.")
        sys.exit(1)


def fetch_page_markdown(notion: NotionClient, page_id: str) -> tuple[str, str, str]:
    """Returns (title, markdown, last_edited_time). Uses Notion's block children
    API and does a simple block->markdown flattening (headings, paragraphs,
    bulleted/numbered lists, toggles, callouts) — good enough for our notes'
    structure; swap for a fuller renderer if pages get more complex."""

    page = notion.pages.retrieve(page_id)
    last_edited_time = page["last_edited_time"]

    title = "Untitled"
    for prop in page.get("properties", {}).values():
        if prop.get("type") == "title" and prop["title"]:
            title = "".join(t["plain_text"] for t in prop["title"])
            break

    lines: list[str] = []

    def walk(block_id: str, depth: int = 0):
        children = notion.blocks.children.list(block_id)["results"]
        for block in children:
            btype = block["type"]
            data = block.get(btype, {})
            text = "".join(t.get("plain_text", "") for t in data.get("rich_text", []))
            indent = "\t" * depth

            if btype == "heading_1":
                lines.append(f"{indent}# {text}")
            elif btype == "heading_2":
                lines.append(f"{indent}## {text}")
            elif btype == "heading_3":
                lines.append(f"{indent}### {text}")
            elif btype in ("bulleted_list_item", "numbered_list_item"):
                lines.append(f"{indent}- {text}")
            elif btype == "toggle":
                lines.append(f"{indent}### {text}")
            elif btype == "callout":
                lines.append(f"{indent}> {text}")
            elif btype == "paragraph" and text:
                lines.append(f"{indent}{text}")

            if block.get("has_children"):
                walk(block["id"], depth + 1)

    walk(page_id)
    return title, "\n".join(lines), last_edited_time


def get_stored_last_edited(conn: psycopg.Connection, notion_page_id: str) -> str | None:
    with conn.cursor() as cur:
        cur.execute(
            'SELECT "lastEditedTime" FROM "SourceDocument" WHERE "notionPageId" = %s',
            (notion_page_id,),
        )
        row = cur.fetchone()
        return row[0].isoformat() if row and row[0] else None


def upsert_source_document(
    conn: psycopg.Connection, notion_page_id: str, title: str, markdown: str, last_edited_time: str
) -> str:
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO "SourceDocument" (id, "notionPageId", title, "rawMarkdown", "lastSyncedAt", "lastEditedTime")
            VALUES (gen_random_uuid()::text, %s, %s, %s, now(), %s)
            ON CONFLICT ("notionPageId") DO UPDATE
              SET title = EXCLUDED.title,
                  "rawMarkdown" = EXCLUDED."rawMarkdown",
                  "lastSyncedAt" = now(),
                  "lastEditedTime" = EXCLUDED."lastEditedTime"
            RETURNING id
            """,
            (notion_page_id, title, markdown, last_edited_time),
        )
        return cur.fetchone()[0]


def upsert_generated_cards(conn: psycopg.Connection, source_document_id: str, cards: list[dict]):
    with conn.cursor() as cur:
        for card in cards:
            cur.execute(
                """
                INSERT INTO "Topic" (id, name, description, pattern, "sourceDocumentId")
                VALUES (gen_random_uuid()::text, %s, NULL, %s, %s)
                ON CONFLICT DO NOTHING
                RETURNING id
                """,
                (card["topicName"], card.get("topicPattern"), source_document_id),
            )
            row = cur.fetchone()
            if row:
                topic_id = row[0]
            else:
                cur.execute('SELECT id FROM "Topic" WHERE name = %s LIMIT 1', (card["topicName"],))
                topic_id = cur.fetchone()[0]

            cur.execute(
                """
                INSERT INTO "Card" (id, type, prompt, answer, explanation, hints, "sourceText", "topicId", "aiGenerated")
                VALUES (gen_random_uuid()::text, %s, %s, %s, %s, %s, %s, %s, true)
                """,
                (
                    card["type"],
                    card["prompt"],
                    card["answer"],
                    card.get("explanation"),
                    card.get("hints", []),
                    card.get("sourceText"),
                    topic_id,
                ),
            )
    conn.commit()


def sync_page(notion: NotionClient, conn: psycopg.Connection, page_id: str):
    print(f"Fetching Notion page {page_id}...")
    title, markdown, last_edited_time = fetch_page_markdown(notion, page_id)

    stored = get_stored_last_edited(conn, page_id)
    if stored == last_edited_time:
        print(f"  '{title}' unchanged since last sync — skipping.")
        return

    print(f"  '{title}' changed (or new) — generating cards via AI service...")
    resp = httpx.post(
        f"{AI_SERVICE_URL}/generate/cards",
        json={"rawMarkdown": markdown, "sourceDocumentTitle": title},
        timeout=120,
    )
    resp.raise_for_status()
    cards = resp.json()["cards"]
    print(f"  Generated {len(cards)} cards.")

    source_document_id = upsert_source_document(conn, page_id, title, markdown, last_edited_time)
    upsert_generated_cards(conn, source_document_id, cards)
    print(f"  Synced '{title}': {len(cards)} cards upserted.")


def main():
    require_env()
    notion = NotionClient(auth=NOTION_API_KEY)
    with psycopg.connect(DATABASE_URL) as conn:
        for page_id in NOTION_PAGE_IDS:
            sync_page(notion, conn, page_id)
    print(f"Sync complete at {datetime.now(timezone.utc).isoformat()}")


if __name__ == "__main__":
    main()
