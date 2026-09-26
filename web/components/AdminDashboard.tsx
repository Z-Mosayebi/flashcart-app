"use client";

import { useCallback, useEffect, useState } from "react";
import { GOALS, GOAL_LABELS, LEVELS, PAY_LABELS, PAY_OPTIONS } from "@/lib/premium";
import { TRIAL_DAY_OPTIONS } from "@/lib/plans";

interface RequestRow {
  id: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  goal: (typeof GOALS)[number];
  level: (typeof LEVELS)[number];
  willingToPay: (typeof PAY_OPTIONS)[number];
  contact: string | null;
  message: string | null;
  grantedDays: number | null;
  createdAt: string;
  user: { id: string; name: string | null; email: string; premiumUntil: string | null };
}

interface Overview {
  requests: RequestRow[];
  pendingCount: number;
  premiumUsers: { id: string; name: string | null; email: string; premiumUntil: string }[];
  analytics: {
    totalUsers: number;
    signups7: number;
    signups30: number;
    active7: number;
    requesters: number;
    requestRatePct: number;
    pay: Record<string, number>;
    goal: Record<string, number>;
    level: Record<string, number>;
    hitGradedCap7: number;
    hitTutorCap7: number;
  };
}

const fmt = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { dateStyle: "medium" });

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="card-surface p-4">
      <p className="text-2xl font-semibold text-ink">{value}</p>
      <p className="mt-1 text-xs text-ink-muted">{label}</p>
    </div>
  );
}

function Bars({ title, counts, label }: { title: string; counts: Record<string, number>; label: (k: string) => string }) {
  const max = Math.max(1, ...Object.values(counts));
  return (
    <div className="card-surface space-y-2 p-4">
      <p className="font-medium text-ink">{title}</p>
      {Object.entries(counts).map(([key, n]) => (
        <div key={key} className="text-sm">
          <div className="flex justify-between text-ink-muted">
            <span>{label(key)}</span>
            <span>{n}</span>
          </div>
          <div className="mt-1 h-2 rounded-full bg-line">
            <div className="h-2 rounded-full bg-brand" style={{ width: `${(n / max) * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Admin-only, English-only: requests, premium users, and demand analytics. */
export default function AdminDashboard() {
  const [data, setData] = useState<Overview | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/overview", { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      setData(await res.json());
    } catch {
      setError("Couldn't load the dashboard.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function act(url: string, body: object, key: string) {
    setBusy(key);
    setError(null);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok && res.status !== 409) throw new Error(String(res.status));
      await load();
    } catch {
      setError("That didn't work. Try again.");
    } finally {
      setBusy(null);
    }
  }

  if (!data) return error ? <p className="text-critical">{error}</p> : <div className="skeleton h-64 w-full" />;
  const a = data.analytics;

  return (
    <div className="space-y-10">
      <header>
        <h1 className="font-display text-3xl font-semibold tracking-tight">Admin</h1>
        {error && <p className="mt-2 text-sm text-critical">{error}</p>}
      </header>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Analytics</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Users" value={a.totalUsers} />
          <Stat label="Sign-ups, 7 / 30 days" value={`${a.signups7} / ${a.signups30}`} />
          <Stat label="Active, last 7 days" value={a.active7} />
          <Stat label="Asked for premium" value={`${a.requesters} (${a.requestRatePct}%)`} />
          <Stat label="Free users who hit the answer limit (7d)" value={a.hitGradedCap7} />
          <Stat label="Free users who hit the tutor limit (7d)" value={a.hitTutorCap7} />
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Bars title="Would pay per month" counts={a.pay} label={(k) => PAY_LABELS[k as keyof typeof PAY_LABELS]} />
          <Bars title="Goal" counts={a.goal} label={(k) => GOAL_LABELS[k as keyof typeof GOAL_LABELS]} />
          <Bars title="Level" counts={a.level} label={(k) => (k === "UNKNOWN" ? "Not sure" : k)} />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Requests ({data.pendingCount} pending)</h2>
        {data.requests.length === 0 && <p className="text-sm text-ink-muted">No requests yet.</p>}
        {data.requests.map((r) => (
          <div key={r.id} className="card-surface space-y-2 p-4 text-sm">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="font-medium text-ink">
                {r.user.name ?? "—"} · <span className="text-ink-muted">{r.user.email}</span>
              </p>
              <p className="text-xs text-ink-faint">
                {fmt(r.createdAt)} · {r.status}
                {r.grantedDays ? ` · ${r.grantedDays} days` : ""}
              </p>
            </div>
            <p className="text-ink-muted">
              {GOAL_LABELS[r.goal]} · {r.level === "UNKNOWN" ? "Level not sure" : r.level} ·{" "}
              {PAY_LABELS[r.willingToPay]}
            </p>
            {r.contact && <p className="text-ink">Contact: {r.contact}</p>}
            {r.message && <p className="whitespace-pre-wrap text-ink">“{r.message}”</p>}
            {r.status === "PENDING" && (
              <div className="flex flex-wrap gap-2 pt-1">
                {TRIAL_DAY_OPTIONS.map((days) => (
                  <button
                    key={days}
                    disabled={busy !== null}
                    onClick={() => act(`/api/admin/requests/${r.id}`, { action: "approve", days }, r.id)}
                    className="btn-primary"
                  >
                    Activate {days} days
                  </button>
                ))}
                <button
                  disabled={busy !== null}
                  onClick={() => act(`/api/admin/requests/${r.id}`, { action: "reject" }, r.id)}
                  className="btn-ghost"
                >
                  Reject
                </button>
              </div>
            )}
          </div>
        ))}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Premium users</h2>
        {data.premiumUsers.length === 0 && <p className="text-sm text-ink-muted">Nobody is on premium right now.</p>}
        {data.premiumUsers.map((u) => (
          <div key={u.id} className="card-surface flex flex-wrap items-center justify-between gap-2 p-4 text-sm">
            <p>
              {u.name ?? "—"} · <span className="text-ink-muted">{u.email}</span> · until {fmt(u.premiumUntil)}
            </p>
            <div className="flex gap-2">
              {TRIAL_DAY_OPTIONS.map((days) => (
                <button
                  key={days}
                  disabled={busy !== null}
                  onClick={() => act(`/api/admin/users/${u.id}`, { action: "extend", days }, u.id)}
                  className="btn-ghost"
                >
                  +{days}d
                </button>
              ))}
              <button
                disabled={busy !== null}
                onClick={() => act(`/api/admin/users/${u.id}`, { action: "revoke" }, u.id)}
                className="btn-ghost text-critical"
              >
                Revoke
              </button>
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
