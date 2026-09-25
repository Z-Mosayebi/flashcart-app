"use client";

import { useCallback, useEffect, useState } from "react";
import type { LimitKind } from "@/lib/plans";

// One definition of the limit kinds, shared with the server (type-only import).
export type { LimitKind };

export interface PlanInfo {
  plan: "free" | "premium";
  admin: boolean;
  premiumUntil: string | null;
  limits: { documents: number; gradedPerDay: number; tutorPerDay: number };
  usage: Record<LimitKind, number>;
  request: { status: "PENDING" | "APPROVED" | "REJECTED"; createdAt: string; grantedDays: number | null } | null;
}

export interface LimitHit {
  kind: LimitKind;
  limit: number;
}

/** The body of a limit response, or null for any other failure. */
export async function readLimitHit(res: Response): Promise<LimitHit | null> {
  if (res.status !== 429 && res.status !== 403) return null;
  const data = await res.clone().json().catch(() => null);
  return data?.error === "limit_reached" ? { kind: data.kind, limit: data.limit } : null;
}

export function usePlan() {
  const [plan, setPlan] = useState<PlanInfo | null>(null);

  const reload = useCallback(() => {
    fetch("/api/me/plan", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setPlan(d))
      .catch(() => {});
  }, []);

  useEffect(reload, [reload]);

  return { plan, reload };
}
