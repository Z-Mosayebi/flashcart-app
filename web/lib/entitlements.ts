/**
 * What a user may do right now: their plan, and today's usage.
 *
 * Daily usage is counted from AiUsage reservations, which are written *before*
 * each model call and deleted if it fails (see lib/usage.ts): a failed request
 * costs nothing, and parallel requests can't slip past the limit.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { reserve, type UsageStore } from "@/lib/usage";
import {
  PLAN_LIMITS,
  countsAsDocument,
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
  /** When the user's current day began, in their zone. */
  dayStart: Date;
  limits: PlanLimits;
  usage: Record<LimitKind, number>;
}

const USAGE_KIND = { graded: "GRADED", tutor: "TUTOR" } as const;

/** Documents that use up allowance: removed ones still do; empty failures don't. */
async function documentsUsed(userId: string): Promise<number> {
  const docs = await prisma.sourceDocument.findMany({
    where: { ownerId: userId },
    select: { status: true, _count: { select: { topics: true } } },
  });
  return docs.filter((d) => countsAsDocument({ status: d.status, topicCount: d._count.topics })).length;
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
    prisma.aiUsage.count({ where: { userId, kind: "GRADED", createdAt: { gte: dayStart } } }),
    prisma.aiUsage.count({ where: { userId, kind: "TUTOR", createdAt: { gte: dayStart } } }),
    documentsUsed(userId),
  ]);

  const premiumUntil = user?.premiumUntil ?? null;
  const plan = planFor(premiumUntil, now);

  return {
    plan,
    admin: isAdminEmail(user?.email),
    premiumUntil,
    timeZone,
    dayStart,
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

export type AiCallReservation =
  | { ok: true; release: () => Promise<void> }
  | { ok: false; response: NextResponse };

/**
 * Takes one unit of today's graded or tutor allowance before a model call.
 * Call `release()` if the call fails or its result is discarded, so the
 * learner isn't charged for it. Admins are recorded but never limited.
 */
export async function reserveAiCall(userId: string, kind: "graded" | "tutor"): Promise<AiCallReservation> {
  const ent = await getEntitlement(userId);
  const usageKind = USAGE_KIND[kind];

  const store: UsageStore = {
    add: async () => (await prisma.aiUsage.create({ data: { userId, kind: usageKind }, select: { id: true } })).id,
    count: () => prisma.aiUsage.count({ where: { userId, kind: usageKind, createdAt: { gte: ent.dayStart } } }),
    remove: async (id) => {
      await prisma.aiUsage.deleteMany({ where: { id } });
    },
  };

  const limit = ent.admin ? Number.POSITIVE_INFINITY : limitFor(ent.limits, kind);
  const reservation = await reserve(store, limit);
  if (!reservation.ok) return { ok: false, response: limitResponse(ent, kind) };

  return { ok: true, release: () => store.remove(reservation.id) };
}

/** Thrown by the import pipeline when a new document would exceed the plan. */
export class DocumentLimitError extends Error {
  constructor(public readonly entitlement: Entitlement) {
    super("document_limit");
  }
}
