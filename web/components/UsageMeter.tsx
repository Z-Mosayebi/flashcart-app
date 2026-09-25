"use client";

import { usePreferences } from "@/components/PreferencesProvider";
import type { PlanInfo } from "@/components/usePlan";

/** "Today 12 / 30" — hidden for admins, who have no limits. */
export default function UsageMeter({ kind, plan }: { kind: "graded" | "tutor"; plan: PlanInfo | null }) {
  const { t } = usePreferences();
  if (!plan || plan.admin) return null;
  const limit = kind === "graded" ? plan.limits.gradedPerDay : plan.limits.tutorPerDay;
  return (
    <span className="shrink-0 text-xs text-ink-faint">
      {t("usage.today", { used: Math.min(plan.usage[kind], limit), limit })}
    </span>
  );
}
