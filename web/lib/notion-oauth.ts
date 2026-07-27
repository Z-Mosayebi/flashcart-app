/**
 * Notion OAuth ("public integration") support.
 *
 * This is the flow regular users get: one button, Notion's own consent screen
 * where they pick which pages to share, done. No integration token to create,
 * no manual page sharing.
 *
 * Requires a public integration registered at notion.so/my-integrations with
 * the redirect URI set to {NEXTAUTH_URL}/api/me/notion/oauth/callback.
 */

const NOTION_AUTH_URL = "https://api.notion.com/v1/oauth/authorize";
const NOTION_TOKEN_URL = "https://api.notion.com/v1/oauth/token";

export function notionOAuthConfigured(): boolean {
  return Boolean(process.env.NOTION_OAUTH_CLIENT_ID && process.env.NOTION_OAUTH_CLIENT_SECRET);
}

export function notionRedirectUri(): string {
  const base = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
  return `${base.replace(/\/$/, "")}/api/me/notion/oauth/callback`;
}

export function notionAuthorizeUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.NOTION_OAUTH_CLIENT_ID!,
    response_type: "code",
    owner: "user",
    redirect_uri: notionRedirectUri(),
    state,
  });
  return `${NOTION_AUTH_URL}?${params.toString()}`;
}

export interface NotionTokenResponse {
  access_token: string;
  workspace_name?: string | null;
  workspace_icon?: string | null;
  workspace_id?: string;
}

/** Exchanges the one-time code for a long-lived access token. */
export async function exchangeCodeForToken(code: string): Promise<NotionTokenResponse> {
  const credentials = Buffer.from(
    `${process.env.NOTION_OAUTH_CLIENT_ID}:${process.env.NOTION_OAUTH_CLIENT_SECRET}`
  ).toString("base64");

  const res = await fetch(NOTION_TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/json",
      "Notion-Version": "2022-06-28",
    },
    body: JSON.stringify({
      grant_type: "authorization_code",
      code,
      redirect_uri: notionRedirectUri(),
    }),
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Notion token exchange failed (${res.status}): ${text.slice(0, 200)}`);
  }

  return res.json();
}

export interface NotionPageSummary {
  id: string;
  title: string;
  url?: string;
}

/**
 * Lists the pages the user granted access to, so we can show a picker instead
 * of asking them to paste a URL. Notion's search endpoint with an empty query
 * returns everything the integration can see.
 */
export async function listAccessiblePages(token: string): Promise<NotionPageSummary[]> {
  const res = await fetch("https://api.notion.com/v1/search", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "Notion-Version": "2022-06-28",
    },
    body: JSON.stringify({
      filter: { property: "object", value: "page" },
      page_size: 100,
    }),
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Notion search failed (${res.status}): ${text.slice(0, 200)}`);
  }

  const data = await res.json();
  const results = (data.results ?? []) as Record<string, any>[];

  return results.map((page) => {
    let title = "Untitled";
    for (const prop of Object.values(page.properties ?? {}) as Record<string, any>[]) {
      if (prop?.type === "title" && Array.isArray(prop.title) && prop.title.length) {
        title = prop.title.map((t: { plain_text?: string }) => t.plain_text ?? "").join("");
        break;
      }
    }
    return {
      id: String(page.id).replace(/-/g, ""),
      title,
      url: page.url,
    };
  });
}
