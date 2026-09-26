import { describe, expect, it } from "vitest";
import { USERS_PAGE_SIZE, canManageUser, likePattern, parseUserQuery } from "@/lib/admin-users";

const params = (s: string) => new URLSearchParams(s);

describe("parseUserQuery", () => {
  it("defaults to newest first, page 1, no search", () =>
    expect(parseUserQuery(params(""))).toEqual({ q: "", sort: "newest", page: 1 }));
  it("reads a trimmed search, a known sort and a page", () =>
    expect(parseUserQuery(params("q=%20sara%20&sort=active&page=3"))).toEqual({ q: "sara", sort: "active", page: 3 }));
  it("ignores unknown sorts and bad pages", () => {
    expect(parseUserQuery(params("sort=evil&page=-2")).sort).toBe("newest");
    expect(parseUserQuery(params("page=abc")).page).toBe(1);
    expect(parseUserQuery(params("page=0")).page).toBe(1);
  });
  it("caps an absurdly long search", () =>
    expect(parseUserQuery(params(`q=${"x".repeat(500)}`)).q.length).toBe(100));
  it("pages by 25", () => expect(USERS_PAGE_SIZE).toBe(25));
});

describe("likePattern", () => {
  it("wraps the search for a contains match", () => expect(likePattern("sara")).toBe("%sara%"));
  it("escapes LIKE wildcards so they match literally", () =>
    // Input 50%_off\  →  each of %, _ and \ gets a backslash in front.
    expect(likePattern("50%_off\\")).toBe("%50\\%\\_off\\\\%"));
});

describe("canManageUser", () => {
  it("allows managing an ordinary user", () =>
    expect(canManageUser({ actorId: "a", targetId: "u", targetIsAdmin: false })).toBe(true));
  it("refuses to act on yourself", () =>
    expect(canManageUser({ actorId: "a", targetId: "a", targetIsAdmin: true })).toBe(false));
  it("refuses to act on another admin", () =>
    expect(canManageUser({ actorId: "a", targetId: "b", targetIsAdmin: true })).toBe(false));
});
