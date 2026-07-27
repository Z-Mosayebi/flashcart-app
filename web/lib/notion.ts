/**
 * Minimal Notion API client for the in-app "sync now" flow.
 *
 * The standalone scripts/sync_notion.py still exists for scheduled batch syncs;
 * this is the interactive path a signed-in user triggers from Settings.
 */

const NOTION_VERSION = "2022-06-28";
const NOTION_API = "https://api.notion.com/v1";

/**
 * Accepts a bare id, a dashed UUID, or any Notion URL and returns the
 * 32-character page id. Notion URLs put the id as the last path segment,
 * usually suffixed onto a slugified title (e.g. /DW-3a9cd39e...).
 */
export function extractNotionPageId(input: string): string | null {
  const trimmed = input.trim();

  // Any run of 32 hex chars, optionally dash-separated as a UUID.
  const matches = trimmed.match(/[0-9a-fA-F]{8}-?[0-9a-fA-F]{4}-?[0-9a-fA-F]{4}-?[0-9a-fA-F]{4}-?[0-9a-fA-F]{12}/g);
  if (!matches || matches.length === 0) return null;

  // A URL may contain several ids (e.g. ?p= params); the page id is the last
  // one in the path portion, so prefer the final match.
  const id = matches[matches.length - 1].replace(/-/g, "").toLowerCase();
  return id.length === 32 ? id : null;
}

interface NotionBlock {
  id: string;
  type: string;
  has_children?: boolean;
  [key: string]: unknown;
}

async function notionFetch(token: string, path: string, init?: RequestInit) {
  const res = await fetch(`${NOTION_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text();
    if (res.status === 401) throw new Error("Notion rejected the token. Check it's correct and not revoked.");
    if (res.status === 404) {
      throw new Error(
        "Notion page not found. Make sure you shared the page with your integration."
      );
    }
    throw new Error(`Notion API error ${res.status}: ${text.slice(0, 200)}`);
  }

  return res.json();
}

function richText(data: Record<string, unknown>): string {
  const arr = (data?.rich_text ?? []) as { plain_text?: string }[];
  return arr.map((t) => t.plain_text ?? "").join("");
}

/**
 * Flattens a Notion page into markdown. Mirrors the block handling in
 * scripts/sync_notion.py so both paths feed the model the same shape of input.
 */
export async function fetchPageMarkdown(
  token: string,
  pageId: string
): Promise<{ title: string; markdown: string; lastEditedTime: string }> {
  const page = await notionFetch(token, `/pages/${pageId}`);
  const lastEditedTime: string = page.last_edited_time;

  let title = "Untitled";
  for (const prop of Object.values(page.properties ?? {}) as Record<string, unknown>[]) {
    if (prop?.type === "title" && Array.isArray(prop.title) && prop.title.length) {
      title = (prop.title as { plain_text?: string }[])
        .map((t) => t.plain_text ?? "")
        .join("");
      break;
    }
  }

  const lines: string[] = [];

  async function walk(blockId: string, depth = 0) {
    // Guard against pathological nesting blowing the request budget.
    if (depth > 6) return;

    let cursor: string | undefined;
    do {
      const qs = cursor ? `?start_cursor=${cursor}&page_size=100` : "?page_size=100";
      const data = await notionFetch(token, `/blocks/${blockId}/children${qs}`);
      const blocks = (data.results ?? []) as NotionBlock[];

      for (const block of blocks) {
        const type = block.type;
        const payload = (block[type] ?? {}) as Record<string, unknown>;
        const text = richText(payload);
        const indent = "\t".repeat(depth);

        if (type === "heading_1") lines.push(`${indent}# ${text}`);
        else if (type === "heading_2") lines.push(`${indent}## ${text}`);
        else if (type === "heading_3") lines.push(`${indent}### ${text}`);
        else if (type === "bulleted_list_item" || type === "numbered_list_item")
          lines.push(`${indent}- ${text}`);
        else if (type === "toggle") lines.push(`${indent}### ${text}`);
        else if (type === "callout") lines.push(`${indent}> ${text}`);
        else if (type === "quote") lines.push(`${indent}> ${text}`);
        else if (type === "code") lines.push(`${indent}\`\`\`\n${text}\n\`\`\``);
        else if (type === "paragraph" && text) lines.push(`${indent}${text}`);

        if (block.has_children) await walk(block.id, depth + 1);
      }

      cursor = data.has_more ? data.next_cursor : undefined;
    } while (cursor);
  }

  await walk(pageId);

  return { title, markdown: lines.join("\n"), lastEditedTime };
}
