"""
Notion -> Flashcart sync job (batch / scheduled).

Pulls one or more Notion pages via the official Notion API, diffs against
`SourceDocument.lastEditedTime` in Postgres to skip unchanged pages, sends
new/changed page content through the AI service's /generate/cards endpoint,
and upserts the resulting cards/topics into the DB.

Cards are per-user. This script syncs into ONE nominated account, identified by
SYNC_USER_EMAIL — useful for keeping your own deck fed on a schedule. Regular
users connect their own Notion page in-app (Settings -> Your notes), which runs
the same logic through /api/me/notion/sync.

Run manually:
    python scripts/sync_notion.py

Run on a schedule:
    - a cron / GitHub Actions scheduled workflow calling this script directly,
      with NOTION_API_KEY, DATABASE_URL, AI_SERVICE_URL and SYNC_USER_EMAIL as secrets.

Requires:
    pip install notion-client psycopg[binary] httpx python-dotenv
    NOTION_API_KEY   - Notion internal integration token (share your pages with it!)
    NOTION_PAGE_IDS  - comma-separated list of page IDs/URLs to sync
    DATABASE_URL     - same Postgres the Next.js app uses
    AI_SERVICE_URL   - the FastAPI service, e.g. http://localhost:8000
    SYNC_USER_EMAIL  - email of the account these cards belong to
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
SYNC_USER_EMAIL = os.environ.get("SYNC_USER_EMAIL")


def require_env():
    missing = [
        name
        for name, val in [
            ("NOTION_API_KEY", NOTION_API_KEY),
            ("DATABASE_URL", DATABASE_URL),
            ("NOTION_PAGE_IDS", NOTION_PAGE_IDS or None),
            ("SYNC_USER_EMAIL", SYNC_USER_EMAIL),
        ]
        if not val
    ]
    if missing:
        print(f"Missing required env vars: {', '.join(missing)}. See scripts/.env.example.")
        sys.exit(1)


def resolve_owner_id(conn: psycopg.Connection, email: str) -> str:
    """Cards must belong to a real account. Fail loudly if it doesn't exist —
    silently creating one would produce a deck nobody can sign in to."""
    with conn.cursor() as cur:
        cur.execute('SELECT id FROM "User" WHERE email = %s', (email.lower(),))
        row = cur.fetchone()
    if not row:
        print(
            f"No account found for SYNC_USER_EMAIL={email!r}. "
            "Sign up in the app first, then re-run this sync."
        )
        sys.exit(1)
    return row[0]


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


def get_stored_last_edited(
    conn: psycopg.Connection, owner_id: str, notion_page_id: str
) -> str | None:
    with conn.cursor() as cur:
        cur.execute(
            'SELECT "lastEditedTime" FROM "SourceDocument" '
            'WHERE "ownerId" = %s AND "notionPageId" = %s',
            (owner_id, notion_page_id),
        )
        row = cur.fetchone()
        return row[0].isoformat() if row and row[0] else None


def upsert_source_document(
    conn: psycopg.Connection,
    owner_id: str,
    notion_page_id: str,
    title: str,
    markdown: str,
    last_edited_time: str,
) -> str:
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO "SourceDocument"
                (id, "notionPageId", title, "rawMarkdown", "lastSyncedAt", "lastEditedTime", "ownerId")
            VALUES (gen_random_uuid()::text, %s, %s, %s, now(), %s, %s)
            ON CONFLICT ("ownerId", "notionPageId") DO UPDATE
              SET title = EXCLUDED.title,
                  "rawMarkdown" = EXCLUDED."rawMarkdown",
                  "lastSyncedAt" = now(),
                  "lastEditedTime" = EXCLUDED."lastEditedTime"
            RETURNING id
            """,
            (notion_page_id, title, markdown, last_edited_time, owner_id),
        )
        return cur.fetchone()[0]


def upsert_generated_cards(
    conn: psycopg.Connection, owner_id: str, source_document_id: str, cards: list[dict]
):
    """Inserts cards owned by `owner_id`. Topics are unique per (owner, name),
    so re-syncing an edited page extends the existing topic rather than cloning
    it, and cards whose prompt already exists for this user are skipped."""
    with conn.cursor() as cur:
        for card in cards:
            cur.execute(
                """
                INSERT INTO "Topic" (id, name, description, pattern, "sourceDocumentId", "ownerId")
                VALUES (gen_random_uuid()::text, %s, NULL, %s, %s, %s)
                ON CONFLICT ("ownerId", name) DO UPDATE SET pattern = COALESCE(EXCLUDED.pattern, "Topic".pattern)
                RETURNING id
                """,
                (card["topicName"], card.get("topicPattern"), source_document_id, owner_id),
            )
            topic_id = cur.fetchone()[0]

            cur.execute(
                'SELECT 1 FROM "Card" WHERE "ownerId" = %s AND prompt = %s LIMIT 1',
                (owner_id, card["prompt"]),
            )
            if cur.fetchone():
                continue

            cur.execute(
                """
                INSERT INTO "Card"
                    (id, type, prompt, answer, explanation, hints, "sourceText", "topicId", "ownerId", "aiGenerated")
                VALUES (gen_random_uuid()::text, %s, %s, %s, %s, %s, %s, %s, %s, true)
                """,
                (
                    card["type"],
                    card["prompt"],
                    card["answer"],
                    card.get("explanation"),
                    card.get("hints", []),
                    card.get("sourceText"),
                    topic_id,
                    owner_id,
                ),
            )
    conn.commit()


def sync_page(notion: NotionClient, conn: psycopg.Connection, owner_id: str, page_id: str):
    print(f"Fetching Notion page {page_id}...")
    title, markdown, last_edited_time = fetch_page_markdown(notion, page_id)

    stored = get_stored_last_edited(conn, owner_id, page_id)
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

    source_document_id = upsert_source_document(
        conn, owner_id, page_id, title, markdown, last_edited_time
    )
    upsert_generated_cards(conn, owner_id, source_document_id, cards)
    print(f"  Synced '{title}': {len(cards)} cards processed.")


def main():
    require_env()
    notion = NotionClient(auth=NOTION_API_KEY)
    with psycopg.connect(DATABASE_URL) as conn:
        owner_id = resolve_owner_id(conn, SYNC_USER_EMAIL)
        print(f"Syncing into account {SYNC_USER_EMAIL} ({owner_id}).")
        for page_id in NOTION_PAGE_IDS:
            sync_page(notion, conn, owner_id, page_id)
    print(f"Sync complete at {datetime.now(timezone.utc).isoformat()}")


if __name__ == "__main__":
    main()
