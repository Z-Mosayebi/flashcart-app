"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import clsx from "clsx";
import { usePreferences } from "@/components/PreferencesProvider";
import SpeakButton from "@/components/SpeakButton";
import RichText from "@/components/RichText";
import ErrorTags from "@/components/ErrorTags";
import UpgradePrompt from "@/components/UpgradePrompt";
import UsageMeter from "@/components/UsageMeter";
import { readLimitHit, usePlan, type LimitHit } from "@/components/usePlan";

interface Card {
  id: string;
  type: string;
  prompt: string;
  hints: string[];
  topic: { name: string; pattern: string | null };
}

interface DueCard {
  progressId: string | null;
  box: number;
  card: Card;
}

interface Evaluation {
  result: "CORRECT" | "PARTIAL" | "INCORRECT";
  feedback: string;
  errorTags: string[];
  difficulty: number;
}

/** Sent by the submit endpoint only after the learner has answered. */
interface Reveal {
  answer: string;
  explanation: string | null;
}

const RESULT_STYLES = {
  CORRECT: {
    wrap: "border-positive/30 bg-positive/10",
    text: "text-positive",
    labelKey: "review.correct",
  },
  PARTIAL: {
    wrap: "border-caution/30 bg-caution/10",
    text: "text-caution",
    labelKey: "review.partial",
  },
  INCORRECT: {
    wrap: "border-critical/30 bg-critical/10",
    text: "text-critical",
    labelKey: "review.incorrect",
  },
} as const;

export default function ReviewSession() {
  const { t, autoPlayAudio } = usePreferences();

  const [queue, setQueue] = useState<DueCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [answer, setAnswer] = useState("");
  const [evaluation, setEvaluation] = useState<Evaluation | null>(null);
  const [reveal, setReveal] = useState<Reveal | null>(null);
  const [limit, setLimit] = useState<LimitHit | null>(null);
  const { plan, reload } = usePlan();
  const [submitting, setSubmitting] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Session tally for the completion screen.
  const [reviewed, setReviewed] = useState(0);
  const [correct, setCorrect] = useState(0);

  const inputRef = useRef<HTMLTextAreaElement>(null);

  const loadQueue = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/cards/due?limit=15");
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      setQueue(data.cards ?? []);
    } catch {
      setError(t("common.error"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void loadQueue();
  }, [loadQueue]);

  const current = queue[0];

  async function submit() {
    if (!current || !answer.trim() || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/review/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cardId: current.card.id, userAnswer: answer }),
      });
      if (res.status === 409) {
        // Already graded from another tab or a double submit; move on rather
        // than grading (and scheduling) the same card twice.
        next();
        return;
      }
      const hit = await readLimitHit(res);
      if (hit) {
        setLimit(hit);
        return;
      }
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      setEvaluation(data.evaluation);
      setReveal(data.reveal ?? null);
      reload();
      setReviewed((n) => n + 1);
      if (data.evaluation?.result === "CORRECT") setCorrect((n) => n + 1);
    } catch {
      setError(t("common.error"));
    } finally {
      setSubmitting(false);
    }
  }

  function next() {
    setQueue((q) => q.slice(1));
    setAnswer("");
    setEvaluation(null);
    setReveal(null);
    setLimit(null);
    setShowHint(false);
    setError(null);
    // Return focus to the input so keyboard users keep their flow.
    setTimeout(() => inputRef.current?.focus(), 100);
  }

  function restart() {
    setReviewed(0);
    setCorrect(0);
    void loadQueue();
  }

  // ---------- Loading ----------

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="skeleton h-4 w-32" />
        <div className="skeleton h-64 w-full" />
      </div>
    );
  }

  // ---------- Session finished / nothing due ----------

  if (!current) {
    const finished = reviewed > 0;
    const accuracy = finished ? Math.round((correct / reviewed) * 100) : 0;

    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        className="card-surface px-6 py-14 text-center"
      >
        <motion.div
          initial={{ scale: 0, rotate: -20 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ delay: 0.1, type: "spring", stiffness: 260, damping: 18 }}
          className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-positive/15 text-positive"
        >
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </motion.div>

        <h2 className="font-display text-2xl font-semibold tracking-tight">
          {finished ? t("review.sessionComplete") : t("review.empty.title")}
        </h2>

        {finished ? (
          <p className="mt-2 text-ink-muted">
            {t("review.reviewed", { count: reviewed })} · {t("review.accuracy", { percent: accuracy })}
          </p>
        ) : (
          <p className="mx-auto mt-2 max-w-sm text-ink-muted">{t("review.empty.body")}</p>
        )}

        <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
          <button onClick={restart} className="btn-ghost">
            {t("review.again")}
          </button>
          <Link href="/tutor" className="btn-primary">
            {t("review.empty.cta")}
          </Link>
        </div>
      </motion.div>
    );
  }

  // ---------- Active card ----------

  const style = evaluation ? RESULT_STYLES[evaluation.result] : null;

  return (
    <div className="space-y-4">
      {/* Progress header */}
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="truncate rounded-full bg-brand-soft px-3 py-1 text-xs font-medium text-brand">
          {current.card.topic.name}
        </span>
        <span className="flex shrink-0 items-center gap-3 text-ink-faint">
          <UsageMeter kind="graded" plan={plan} />
          {t("review.progress", { done: reviewed, left: queue.length })}
        </span>
      </div>

      {/* Box progress bar */}
      <div className="flex gap-1" aria-hidden>
        {[1, 2, 3, 4, 5].map((b) => (
          <motion.div
            key={b}
            className={clsx(
              "h-1 flex-1 rounded-full",
              b <= current.box ? "bg-brand" : "bg-line"
            )}
            initial={{ scaleX: 0.6, opacity: 0.5 }}
            animate={{ scaleX: 1, opacity: 1 }}
            transition={{ delay: b * 0.04, duration: 0.3 }}
          />
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={current.card.id}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -16 }}
          transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
          className="card-surface overflow-hidden"
        >
          {/* Prompt + audio */}
          <div className="flex items-start gap-3 p-5 sm:p-7">
            <div className="min-w-0 flex-1">
              <p lang="de" className="text-german text-lg leading-relaxed sm:text-xl">
                <RichText text={current.card.prompt} />
              </p>
            </div>
            <SpeakButton
              text={current.card.prompt}
              autoPlay={autoPlayAudio}
              label={t("review.listen")}
            />
          </div>

          <div className="space-y-4 px-5 pb-5 sm:px-7 sm:pb-7">
            {/* Hint */}
            {current.card.hints.length > 0 && !evaluation && (
              <div>
                <button
                  onClick={() => setShowHint((s) => !s)}
                  className="text-sm text-ink-muted underline underline-offset-4 hover:text-ink"
                >
                  {showHint ? t("review.hideHint") : t("review.showHint")}
                </button>
                <AnimatePresence>
                  {showHint && (
                    <motion.p
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.25 }}
                      className="mt-2 text-sm italic text-ink-muted text-german"
                    >
                      {current.card.hints.join(" · ")}
                    </motion.p>
                  )}
                </AnimatePresence>
              </div>
            )}

            {!evaluation ? (
              <>
                <textarea
                  ref={inputRef}
                  maxLength={2000}
                  lang="de"
                  autoFocus
                  className="field text-german min-h-[6rem] resize-none"
                  rows={3}
                  placeholder={t("review.placeholder")}
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                  onKeyDown={(e) => {
                    // Cmd/Ctrl+Enter submits without reaching for the mouse.
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                      e.preventDefault();
                      void submit();
                    }
                  }}
                />
                <motion.button
                  whileTap={{ scale: 0.98 }}
                  onClick={submit}
                  disabled={submitting || !answer.trim()}
                  className="btn-primary w-full sm:w-auto"
                >
                  {submitting ? t("review.checking") : t("review.submit")}
                </motion.button>
              </>
            ) : (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                className="space-y-4"
              >
                {/* Your answer, for comparison */}
                <div className="rounded-xl bg-surface-raised px-4 py-3">
                  <p lang="de" className="text-german text-sm">{answer}</p>
                </div>

                {/* Verdict */}
                <div className={clsx("rounded-xl border px-4 py-3", style!.wrap)}>
                  <p className={clsx("mb-1 text-sm font-semibold", style!.text)}>
                    {t(style!.labelKey as "review.correct")}
                  </p>
                  <p className="text-sm leading-relaxed text-ink">
                    <RichText text={evaluation.feedback} />
                  </p>
                  <ErrorTags tags={evaluation.errorTags} />
                </div>

                {/* Reference answer, with audio so you hear it done right */}
                {evaluation.result !== "CORRECT" && reveal && (
                  <div className="flex items-start gap-3 rounded-xl border border-line px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="mb-1 text-xs font-medium uppercase tracking-wide text-ink-faint">
                        {t("review.expected")}
                      </p>
                      <p lang="de" className="text-german">{reveal.answer}</p>
                    </div>
                    <SpeakButton text={reveal.answer} size="sm" label={t("review.listen")} />
                  </div>
                )}

                {reveal?.explanation && (
                  <p className="text-sm leading-relaxed text-ink-muted">
                    <RichText text={reveal.explanation} />
                  </p>
                )}

              </motion.div>
            )}

            {limit && <UpgradePrompt kind={limit.kind} limit={limit.limit} />}

            {error && (
              <p className="rounded-xl border border-critical/30 bg-critical/10 px-4 py-3 text-sm text-critical">
                {error}
              </p>
            )}
          </div>
        </motion.div>
      </AnimatePresence>

      {/* Outside the card so it can stick: however long the feedback, the
          button stays in reach. On phones it sits above the bottom nav. */}
      {evaluation && (
        <div className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-30 -mx-4 bg-gradient-to-t from-canvas via-canvas/95 to-transparent px-4 pb-2 pt-6 sm:bottom-4 sm:mx-0 sm:px-0">
          <motion.button
            whileTap={{ scale: 0.98 }}
            onClick={next}
            autoFocus
            className="btn-primary w-full shadow-lg sm:w-auto"
          >
            {t("review.next")}
          </motion.button>
        </div>
      )}
    </div>
  );
}
