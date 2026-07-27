"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import { usePreferences } from "@/components/PreferencesProvider";

interface TopicMastery {
  topic: string;
  total: number;
  mastered: number;
  pct: number;
}

interface Mistake {
  cardPrompt: string;
  cardAnswer: string;
  topic: string;
  userAnswer: string;
  aiFeedback: string | null;
  errorTags: string[];
  createdAt: string;
}

interface DashboardData {
  overall: { total: number; byBox: Record<string, number>; masteredPct: number };
  dueToday: number;
  totalCards: number;
  streak: number;
  topicMastery: TopicMastery[];
  recentMistakes: Mistake[];
  accuracyPct: number;
  totalAttempts: number;
}

const BOX_COLORS = ["bg-box1", "bg-box2", "bg-box3", "bg-box4", "bg-box5"];

function StatTile({
  label,
  value,
  suffix,
  delay,
}: {
  label: string;
  value: number;
  suffix?: string;
  delay: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className="card-surface p-4 sm:p-5"
    >
      <p className="text-xs font-medium uppercase tracking-wide text-ink-faint">{label}</p>
      <p className="mt-1.5 font-display text-2xl font-semibold tabular-nums sm:text-3xl">
        {value}
        {suffix && <span className="text-lg text-ink-muted">{suffix}</span>}
      </p>
    </motion.div>
  );
}

export default function Dashboard() {
  const { t } = usePreferences();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/dashboard")
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json();
      })
      .then(setData)
      .catch(() => setError(t("common.error")))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="skeleton h-9 w-40" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="skeleton h-24" />
          ))}
        </div>
        <div className="skeleton h-40 w-full" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="card-surface p-8 text-center">
        <p className="text-ink-muted">{error ?? t("common.error")}</p>
      </div>
    );
  }

  if (data.totalCards === 0) {
    return (
      <div className="card-surface px-6 py-14 text-center">
        <h2 className="font-display text-xl font-semibold">{t("dashboard.empty.title")}</h2>
        <p className="mx-auto mt-2 max-w-sm text-ink-muted">{t("dashboard.empty.body")}</p>
      </div>
    );
  }

  const maxBox = Math.max(1, ...Object.values(data.overall.byBox));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-3xl font-semibold tracking-tight">
          {t("dashboard.title")}
        </h1>
        <Link href="/review" className="btn-primary">
          {t("dashboard.startReview")}
        </Link>
      </div>

      {/* Stat tiles */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label={t("dashboard.mastery")} value={data.overall.masteredPct} suffix="%" delay={0} />
        <StatTile label={t("dashboard.accuracy")} value={data.accuracyPct} suffix="%" delay={0.05} />
        <StatTile label={t("dashboard.dueToday")} value={data.dueToday} delay={0.1} />
        <StatTile label={t("dashboard.streak")} value={data.streak} delay={0.15} />
      </div>

      {/* Leitner box distribution — CSS bars rather than a chart lib, so it
          stays legible on a phone and ships no extra JS. */}
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        className="card-surface p-5 sm:p-6"
      >
        <h2 className="mb-5 font-medium">{t("dashboard.boxes")}</h2>
        <div className="flex items-end gap-2 sm:gap-3" style={{ height: 140 }}>
          {[1, 2, 3, 4, 5].map((box, i) => {
            const count = data.overall.byBox[String(box)] ?? 0;
            const pct = (count / maxBox) * 100;
            return (
              <div key={box} className="flex flex-1 flex-col items-center gap-2">
                <span className="text-xs tabular-nums text-ink-muted">{count}</span>
                <div className="flex w-full flex-1 items-end">
                  <motion.div
                    className={`w-full rounded-t-lg ${BOX_COLORS[i]}`}
                    initial={{ height: 0 }}
                    animate={{ height: `${Math.max(pct, count > 0 ? 6 : 2)}%` }}
                    transition={{ delay: 0.3 + i * 0.07, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                  />
                </div>
                <span className="text-[11px] text-ink-faint">{box}</span>
              </div>
            );
          })}
        </div>
      </motion.section>

      {/* Per-topic mastery */}
      {data.topicMastery.length > 0 && (
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          className="card-surface p-5 sm:p-6"
        >
          <h2 className="mb-4 font-medium">{t("dashboard.mastery")}</h2>
          <div className="space-y-3.5">
            {data.topicMastery.slice(0, 8).map((tm, i) => (
              <div key={tm.topic}>
                <div className="mb-1.5 flex items-baseline justify-between gap-3 text-sm">
                  <span className="truncate text-german">{tm.topic}</span>
                  <span className="shrink-0 tabular-nums text-ink-faint">
                    {tm.mastered}/{tm.total}
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-line">
                  <motion.div
                    className="h-full rounded-full bg-brand"
                    initial={{ width: 0 }}
                    animate={{ width: `${tm.pct}%` }}
                    transition={{ delay: 0.35 + i * 0.05, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                  />
                </div>
              </div>
            ))}
          </div>
        </motion.section>
      )}

      {/* Recent mistakes */}
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        className="card-surface p-5 sm:p-6"
      >
        <h2 className="mb-4 font-medium">{t("dashboard.recentMistakes")}</h2>
        {data.recentMistakes.length === 0 ? (
          <p className="text-sm text-ink-muted">{t("dashboard.noMistakes")}</p>
        ) : (
          <ul className="divide-y divide-line">
            {data.recentMistakes.map((m, i) => (
              <li key={i} className="py-3.5 first:pt-0 last:pb-0">
                <p className="mb-1 text-xs text-ink-faint">{m.topic}</p>
                <p lang="de" className="text-german text-sm">
                  {m.cardPrompt}
                </p>
                <p className="mt-1.5 text-sm text-critical">
                  <span className="text-ink-faint">✗ </span>
                  {m.userAnswer}
                </p>
                <p lang="de" className="mt-0.5 text-german text-sm text-positive">
                  <span className="text-ink-faint">✓ </span>
                  {m.cardAnswer}
                </p>
                {m.errorTags.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {m.errorTags.map((tag) => (
                      <span
                        key={tag}
                        className="rounded-full bg-surface-raised px-2 py-0.5 text-[11px] text-ink-muted"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </motion.section>
    </div>
  );
}
