/**
 * What a user may do right now: their plan, and today's usage counted from
 * rows the app already writes. A model call that fails writes no row, so a
 * failed request never costs the learner any of their allowance.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  PLAN_LIMITS,
  isAdminEmail,
  limitFor,
  planFor,
  resolveTimeZone,
  startOfDay,
  type LimitKind,
  type PlanLimits,
  type PlanName,
} from "@/lib/plans";

export interface Entitlement {
  plan: PlanName;
  admin: boolean;
  premiumUntil: Date | null;
  /** The zone the user's day is counted in. */
  timeZone: string;
  limits: PlanLimits;
  usage: Record<LimitKind, number>;
}

export async function getEntitlement(userId: string, now: Date = new Date()): Promise<Entitlement> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, premiumUntil: true, timeZone: true },
  });
  const timeZone = resolveTimeZone(user?.timeZone);
  // "Today" is the user's own day, so limits reset at their midnight.
  const dayStart = startOfDay(now, timeZone);

  const [graded, tutor, documents] = await Promise.all([
    prisma.attempt.count({ where: { userId, createdAt: { gte: dayStart } } }),
    // Every tutor model call writes exactly one ASSISTANT message.
    prisma.tutorMessage.count({
      where: { role: "ASSISTANT", createdAt: { gte: dayStart }, session: { userId } },
    }),
    prisma.sourceDocument.count({ where: { ownerId: userId } }),
  ]);

  const premiumUntil = user?.premiumUntil ?? null;
  const plan = planFor(premiumUntil, now);

  return {
    plan,
    admin: isAdminEmail(user?.email),
    premiumUntil,
    timeZone,
    limits: PLAN_LIMITS[plan],
    usage: { graded, tutor, documents },
  };
}

/** The response every limited endpoint returns, so the UI handles one shape. */
export function limitResponse(ent: Entitlement, kind: LimitKind) {
  return NextResponse.json(
    { error: "limit_reached", kind, limit: limitFor(ent.limits, kind), plan: ent.plan },
    { status: kind === "documents" ? 403 : 429 }
  );
}

/** Thrown by the import pipeline when a new document would exceed the plan. */
export class DocumentLimitError extends Error {
  constructor(public readonly entitlement: Entitlement) {
    super("document_limit");
  }
}
