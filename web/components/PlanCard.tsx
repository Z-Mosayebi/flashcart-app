"use client";

import Link from "next/link";
import { usePreferences } from "@/components/PreferencesProvider";
import { usePlan } from "@/components/usePlan";

/** The plan, its allowance, and the way to more — top of Settings. */
export default function PlanCard() {
  const { t, locale } = usePreferences();
  const { plan } = usePlan();
  if (!plan) return <div className="skeleton h-16 w-full" />;

  const date = plan.premiumUntil
    ? new Date(plan.premiumUntil).toLocaleDateString(locale === "de" ? "de-DE" : "en-GB", { dateStyle: "medium" })
    : null;

  const title = plan.admin
    ? t("plan.admin")
    : plan.plan === "premium" && date
      ? t("plan.premiumUntil", { date })
      : t("plan.free");

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="font-semibold text-ink">{title}</p>
        {!plan.admin && (
          <p className="mt-0.5 text-sm text-ink-muted">
            {t("plan.documents", { used: plan.usage.documents, limit: plan.limits.documents })} ·{" "}
            {t("plan.daily", { graded: plan.limits.gradedPerDay, tutor: plan.limits.tutorPerDay })}
          </p>
        )}
      </div>
      {!plan.admin && plan.plan === "free" &&
        (plan.request?.status === "PENDING" ? (
          <p className="text-sm text-ink-muted">{t("plan.pending")}</p>
        ) : (
          <Link href="/premium" className="btn-primary shrink-0">
            {t("plan.getMore")}
          </Link>
        ))}
    </div>
  );
}
