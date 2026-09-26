/** Pure rules behind the admin's user list: query parsing and who may act on whom. */

export const USERS_PAGE_SIZE = 25;
const MAX_SEARCH_CHARS = 100;

export const USER_SORTS = ["newest", "active", "name"] as const;
export type UserSort = (typeof USER_SORTS)[number];

export interface UserQuery {
  q: string;
  sort: UserSort;
  page: number;
}

export function parseUserQuery(params: URLSearchParams): UserQuery {
  const q = (params.get("q") ?? "").trim().slice(0, MAX_SEARCH_CHARS);
  const rawSort = params.get("sort");
  const sort = (USER_SORTS as readonly string[]).includes(rawSort ?? "") ? (rawSort as UserSort) : "newest";
  const page = Number.parseInt(params.get("page") ?? "", 10);
  return { q, sort, page: Number.isFinite(page) && page >= 1 ? page : 1 };
}

/** A contains-match pattern for ILIKE, with the search's own wildcards escaped. */
export function likePattern(q: string): string {
  return `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

/**
 * Whether an admin may block or delete a user. Never yourself (you could
 * lock yourself out), never another admin (admins are peers).
 */
export function canManageUser(p: { actorId: string; targetId: string; targetIsAdmin: boolean }): boolean {
  return p.actorId !== p.targetId && !p.targetIsAdmin;
}
