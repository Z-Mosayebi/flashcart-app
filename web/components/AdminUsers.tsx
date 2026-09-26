"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { TRIAL_DAY_OPTIONS } from "@/lib/plans";

interface UserRow {
  id: string;
  name: string | null;
  email: string;
  createdAt: string;
  lastActive: string | null;
  admin: boolean;
  blocked: boolean;
  plan: "free" | "premium";
  premiumUntil: string | null;
  documents: number;
  cards: number;
  answers: number;
  today: { graded: number; tutor: number };
  limits: { documents: number; gradedPerDay: number; tutorPerDay: number };
}

interface Page {
  users: UserRow[];
  total: number;
  page: number;
  pageSize: number;
}

type Sort = "newest" | "active" | "name";

const fmt = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-GB", { dateStyle: "medium" }) : "—";

function Badge({ tone, children }: { tone: "brand" | "critical" | "positive" | "muted"; children: React.ReactNode }) {
  return (
    <span
      className={clsx(
        "rounded-full px-2 py-0.5 text-[11px] font-medium",
        tone === "brand" && "bg-brand-soft text-brand",
        tone === "critical" && "bg-critical/15 text-critical",
        tone === "positive" && "bg-positive/15 text-positive",
        tone === "muted" && "bg-surface-raised text-ink-muted"
      )}
    >
      {children}
    </span>
  );
}

/** Admin-only user list: search, sort, and premium / block / delete per user. */
export default function AdminUsers({ onChanged }: { onChanged?: () => void }) {
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<Sort>("newest");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Page | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<UserRow | null>(null);
  const [confirmEmail, setConfirmEmail] = useState("");
  const searchTimer = useRef<ReturnType<typeof setTimeout>>();

  const load = useCallback(async (query: string, s: Sort, p: number) => {
    try {
      const params = new URLSearchParams({ q: query, sort: s, page: String(p) });
      const res = await fetch(`/api/admin/users?${params}`, { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      setData(await res.json());
    } catch {
      setError("Couldn't load users.");
    }
  }, []);

  useEffect(() => {
    void load(q, sort, page);
    // q is loaded through the debounced search below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load, sort, page]);

  function onSearch(value: string) {
    setQ(value);
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setPage(1);
      void load(value, sort, 1);
    }, 300);
  }

  async function act(user: UserRow, init: RequestInit, key: string) {
    setBusy(key);
    setError(null);
    try {
      const res = await fetch(`/api/admin/users/${user.id}`, {
        ...init,
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail ?? "That didn't work. Try again.");
      }
      await load(q, sort, page);
      onChanged?.();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "That didn't work. Try again.");
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    const ok = await act(
      deleting,
      { method: "DELETE", body: JSON.stringify({ confirmEmail }) },
      `${deleting.id}:delete`
    );
    if (ok) {
      setDeleting(null);
      setConfirmEmail("");
    }
  }

  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 className="text-lg font-semibold">Users{data ? ` (${data.total})` : ""}</h2>
        <div className="flex flex-wrap gap-2">
          <input
            className="field w-56"
            placeholder="Search name or email"
            value={q}
            onChange={(e) => onSearch(e.target.value)}
          />
          <select
            className="field w-auto"
            value={sort}
            onChange={(e) => {
              setSort(e.target.value as Sort);
              setPage(1);
            }}
          >
            <option value="newest">Newest sign-up</option>
            <option value="active">Recently active</option>
            <option value="name">Name</option>
          </select>
        </div>
      </div>

      {error && <p className="text-sm text-critical">{error}</p>}
      {!data && <div className="skeleton h-40 w-full" />}
      {data && data.users.length === 0 && <p className="text-sm text-ink-muted">No users found.</p>}

      {data?.users.map((u) => {
        const manageable = !u.admin;
        return (
          <div key={u.id} className={clsx("card-surface space-y-3 p-4 text-sm", u.blocked && "opacity-70")}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <p className="truncate font-medium text-ink">{u.name ?? "—"}</p>
                <span className="truncate text-ink-muted">{u.email}</span>
                {u.admin && <Badge tone="brand">Admin</Badge>}
                {u.blocked && <Badge tone="critical">Blocked</Badge>}
                {u.plan === "premium" ? (
                  <Badge tone="positive">Premium until {fmt(u.premiumUntil)}</Badge>
                ) : (
                  <Badge tone="muted">Free</Badge>
                )}
              </div>
              <p className="text-xs text-ink-faint">
                Joined {fmt(u.createdAt)} · Last active {fmt(u.lastActive)}
              </p>
            </div>

            <p className="text-ink-muted">
              {u.documents} documents · {u.cards} cards · {u.answers} answers · Today{" "}
              {u.admin
                ? "(no limits)"
                : `${u.today.graded}/${u.limits.gradedPerDay} answers, ${u.today.tutor}/${u.limits.tutorPerDay} tutor`}
            </p>

            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-ink-faint">Premium:</span>
              {TRIAL_DAY_OPTIONS.map((days) => (
                <button
                  key={days}
                  disabled={busy !== null}
                  onClick={() => act(u, { method: "POST", body: JSON.stringify({ action: "extend", days }) }, `${u.id}:${days}`)}
                  className="btn-ghost px-2.5 py-1 text-xs"
                >
                  +{days}d
                </button>
              ))}
              {u.plan === "premium" && (
                <button
                  disabled={busy !== null}
                  onClick={() => act(u, { method: "POST", body: JSON.stringify({ action: "revoke" }) }, `${u.id}:revoke`)}
                  className="btn-ghost px-2.5 py-1 text-xs"
                >
                  Revoke
                </button>
              )}

              {manageable && (
                <span className="ml-auto flex gap-2">
                  <button
                    disabled={busy !== null}
                    onClick={() =>
                      act(
                        u,
                        { method: "POST", body: JSON.stringify({ action: u.blocked ? "unblock" : "block" }) },
                        `${u.id}:block`
                      )
                    }
                    className="btn-ghost px-2.5 py-1 text-xs"
                  >
                    {u.blocked ? "Unblock" : "Block"}
                  </button>
                  <button
                    disabled={busy !== null}
                    onClick={() => {
                      setDeleting(u);
                      setConfirmEmail("");
                    }}
                    className="btn-ghost px-2.5 py-1 text-xs text-critical"
                  >
                    Delete
                  </button>
                </span>
              )}
            </div>
          </div>
        );
      })}

      {data && pages > 1 && (
        <div className="flex items-center justify-center gap-3 text-sm">
          <button className="btn-ghost" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            Previous
          </button>
          <span className="text-ink-muted">
            Page {page} of {pages}
          </span>
          <button className="btn-ghost" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
            Next
          </button>
        </div>
      )}

      {deleting && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setDeleting(null)}
        >
          <div className="card-surface w-full max-w-md space-y-4 p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-critical">Delete this account?</h3>
            <p className="text-sm text-ink-muted">
              This permanently deletes <strong className="text-ink">{deleting.email}</strong> and everything it owns:
              cards, progress, documents, requests and usage. It can&apos;t be undone — only a database backup brings
              it back.
            </p>
            <label className="block space-y-1 text-sm">
              <span className="text-ink">Type the email to confirm</span>
              <input
                className="field"
                value={confirmEmail}
                onChange={(e) => setConfirmEmail(e.target.value)}
                autoFocus
              />
            </label>
            <div className="flex justify-end gap-2">
              <button className="btn-ghost" onClick={() => setDeleting(null)}>
                Cancel
              </button>
              <button
                className="btn-primary bg-critical hover:bg-critical"
                disabled={
                  busy !== null || confirmEmail.trim().toLowerCase() !== deleting.email.toLowerCase()
                }
                onClick={confirmDelete}
              >
                Delete permanently
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
