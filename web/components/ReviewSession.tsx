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
import { afterAnswer, verdictLabelKey } from "@/lib/review-flow";
import HoloCard from "@/components/HoloCard";
import { announceProgress } from "@/lib/progress-events";
import AiWaiting from "@/components/AiWaiting";
import { cardPosition, deckLayers, rarityForBox } from "@/lib/card-look";
import { playCardSound, type CardSound } from "@/lib/card-sounds";

interface Card {
  id: string;
  type: string;
  prompt: string;
  hints: string[];
  topic: { id: string; name: string; pattern: string | null };
}

interface DueCard {
  progressId: string | null;
  box: number;
  correctStreak: number;
  card: Card;
}

interface Evaluation {
  result: "CORRECT" | "PARTIAL" | "INCORRECT";
  feedback: string;
  errorTags: string[];
  difficulty: number;
  gaveUp?: boolean;
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
  },
  PARTIAL: {
    wrap: "border-caution/30 bg-caution/10",
    text: "text-caution",
  },
  INCORRECT: {
    wrap: "border-critical/30 bg-critical/10",
    text: "text-critical",
  },
} as const;

export default function ReviewSession() {
  const { t, autoPlayAudio, cardSounds } = usePreferences();
  const play = useCallback(
    (sound: CardSound) => {
      if (cardSounds) playCardSound(sound);
    },
    [cardSounds]
  );

  const [queue, setQueue] = useState<DueCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [answer, setAnswer] = useState("");
  const [evaluation, setEvaluation] = useState<Evaluation | null>(null);
  const [reveal, setReveal] = useState<Reveal | null>(null);
  const [limit, setLimit] = useState<LimitHit | null>(null);
  // answer → (wrong) retry-offered → retry → done; a right answer goes straight to done.
  const [stage, setStage] = useState<"answer" | "retry-offered" | "retry" | "done">("answer");
  // The first attempt's verdict, kept on screen while the learner retries.
  const [firstTry, setFirstTry] = useState<Evaluation | null>(null);
  const { plan, reload } = usePlan();
  const [submitting, setSubmitting] = useState(false);
  // True only while the AI grades an answer (not for quick, local actions).
  const [grading, setGrading] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Session tally for the completion screen.
  const [reviewed, setReviewed] = useState(0);
  const [correct, setCorrect] = useState(0);
  // Size of the deck when the session was dealt, for "#n / total".
  const [sessionTotal, setSessionTotal] = useState(0);

  const inputRef = useRef<HTMLTextAreaElement>(null);

  const loadQueue = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/cards/due?limit=15");
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      setQueue(data.cards ?? []);
      setSessionTotal((data.cards ?? []).length);
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

  // A new card comes off the deck.
  const currentId = current?.card.id;
  useEffect(() => {
    if (currentId) play("deal");
    // Only the card changing should deal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentId]);

  // The deck ran out after at least one card: a short "done" flourish.
  const finishedSession = !loading && !current && reviewed > 0;
  useEffect(() => {
    if (finishedSession) play("complete");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finishedSession]);

  async function submit() {
    if (!current || !answer.trim() || submitting) return;
    setSubmitting(true);
    setGrading(true);
    setError(null);
    try {
      const res = await fetch("/api/review/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cardId: current.card.id, userAnswer: answer, retry: stage === "retry" }),
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
      const isRetry = stage === "retry";
      setEvaluation(data.evaluation);
      setReveal(data.reveal ?? null);
      setStage(afterAnswer(data.evaluation.result, isRetry, data.evaluation.gaveUp));
      play(data.evaluation.result === "CORRECT" ? "correct" : "wrong");
      reload();
      announceProgress();
      // The session tally, like the Leitner box, reflects the first answer.
      if (!isRetry) {
        setReviewed((n) => n + 1);
        if (data.evaluation?.result === "CORRECT") setCorrect((n) => n + 1);
      }
    } catch {
      setError(t("common.error"));
    } finally {
      setSubmitting(false);
      setGrading(false);
    }
  }

  /** Use the one retry: keep the first feedback visible, clear the answer box. */
  function tryAgain() {
    setFirstTry(evaluation);
    setEvaluation(null);
    setAnswer("");
    setStage("retry");
    setTimeout(() => inputRef.current?.focus(), 100);
  }

  /**
   * "I don't know" before answering: the card counts as not known and the
   * answer is shown right away — no model call, no allowance used.
   */
  async function dontKnow() {
    if (!current || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/review/dont-know", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cardId: current.card.id }),
      });
      if (res.status === 409) {
        next();
        return;
      }
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      setAnswer("");
      setEvaluation({ result: "INCORRECT", feedback: "", errorTags: [], difficulty: 1, gaveUp: true });
      setReveal(data.reveal);
      setStage("done");
      setReviewed((n) => n + 1);
      announceProgress();
    } catch {
      setError(t("common.error"));
    } finally {
      setSubmitting(false);
    }
  }

  /** Skip the retry and see the reference answer. */
  async function showAnswer() {
    if (!current) return;
    setError(null);
    try {
      const res = await fetch(`/api/cards/${current.card.id}/reveal`);
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      setReveal(data.reveal);
      setStage("done");
    } catch {
      setError(t("common.error"));
    }
  }

  function next() {
    setQueue((q) => q.slice(1));
    setStage("answer");
    setFirstTry(null);
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
  const side = stage === "answer" || stage === "retry" ? "front" : "back";
  const layers = deckLayers(queue.length);

  const front = (
    <div className="relative space-y-4 p-5 pt-6 sm:p-7 sm:pt-7">
      {/* While the AI grades: cover the card with a clear "working" state. */}
      <AnimatePresence>
        {grading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="absolute inset-0 z-10 flex items-center justify-center bg-[rgb(var(--surface)/0.9)] px-6 backdrop-blur-sm"
          >
            <AiWaiting context="review" />
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex items-start gap-3">
        <p lang="de" className="text-german min-w-0 flex-1 text-lg leading-relaxed sm:text-xl">
          <RichText text={current.card.prompt} />
        </p>
        <SpeakButton
          text={current.card.prompt}
          autoPlay={autoPlayAudio && stage === "answer"}
          label={t("review.listen")}
        />
      </div>

      {/* Hint */}
      {current.card.hints.length > 0 && stage === "answer" && (
        <div>
          <button
            onClick={() => setShowHint((s) => !s)}
            className="min-h-10 text-sm text-ink-muted underline underline-offset-4 hover:text-ink"
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

      {/* On the retry, the first verdict stays visible as guidance. */}
      {stage === "retry" && firstTry && (
        <div className="rounded-xl border border-line px-4 py-3">
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-ink-faint">
            {t("review.secondTry")}
          </p>
          <p className="text-sm leading-relaxed text-ink-muted">
            <RichText text={firstTry.feedback} />
          </p>
          <ErrorTags tags={firstTry.errorTags} />
          {/* The card's own hint comes along for the second try. */}
          {current.card.hints.length > 0 && (
            <p className="mt-3 text-sm italic text-ink-muted text-german">💡 {current.card.hints.join(" · ")}</p>
          )}
        </div>
      )}

      <textarea
        ref={inputRef}
        maxLength={2000}
        lang="de"
        autoFocus
        className="field text-german min-h-[6rem] resize-none"
        rows={3}
        placeholder={t("review.placeholder")}
        value={answer}
        readOnly={submitting}
        onChange={(e) => setAnswer(e.target.value)}
        onKeyDown={(e) => {
          // Cmd/Ctrl+Enter submits without reaching for the mouse.
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            void submit();
          }
        }}
      />
      {/* Stacked full-width on phones, side by side from sm up. */}
      <div className="flex flex-col gap-2 sm:flex-row">
        <motion.button
          whileTap={{ scale: 0.98 }}
          onClick={submit}
          disabled={submitting || !answer.trim()}
          className="btn-primary w-full sm:w-auto"
        >
          {submitting ? t("review.checking") : t("review.submit")}
        </motion.button>
        <button
          onClick={() => void (stage === "retry" ? showAnswer() : dontKnow())}
          disabled={submitting}
          className="btn-ghost w-full sm:w-auto"
        >
          {stage === "retry" ? t("review.showAnswer") : t("review.dontKnow")}
        </button>
      </div>
    </div>
  );

  const back = evaluation && (
    <div className="space-y-4 p-5 pt-6 sm:p-7 sm:pt-7">
      {/* The question stays in view on the back, quieter. */}
      <p lang="de" className="text-german text-sm leading-relaxed text-ink-muted">
        <RichText text={current.card.prompt} />
      </p>

      {/* Your answer, for comparison (none after "I don't know") */}
      {answer && (
        <div className="rounded-xl bg-surface-raised px-4 py-3">
          <p lang="de" className="text-german text-sm">{answer}</p>
        </div>
      )}

      {/* Verdict */}
      <div className={clsx("rounded-xl border px-4 py-3", style!.wrap)}>
        <p className={clsx("mb-1 text-sm font-semibold", style!.text)}>
          {t(verdictLabelKey(evaluation.result, stage === "done"))}
        </p>
        {evaluation.feedback && (
          <p className="text-sm leading-relaxed text-ink">
            <RichText text={evaluation.feedback} />
          </p>
        )}
        <ErrorTags tags={evaluation.errorTags} />
      </div>

      {/* Reference answer, with audio so you hear it done right */}
      {evaluation.result !== "CORRECT" && reveal && (
        <div className="flex items-start gap-3 rounded-xl border border-line px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-ink-faint">{t("review.expected")}</p>
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

      {/* When one explanation isn't enough: practise the same topic. */}
      {stage === "done" && evaluation.result !== "CORRECT" && (
        <Link
          href={`/tutor?topic=${encodeURIComponent(current.card.topic.id)}`}
          className="inline-flex min-h-10 items-center text-sm font-medium text-brand underline-offset-4 hover:underline"
        >
          {t("review.practiseTopic")} →
        </Link>
      )}
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Progress header */}
      <div className="flex items-center justify-end gap-3 text-sm text-ink-faint">
        <UsageMeter kind="graded" plan={plan} />
        {t("review.progress", { done: reviewed, left: queue.length })}
      </div>

      {/* The deck: the current card on top, up to three waiting underneath.
          overflow-x-clip keeps the offset cards from widening the page on
          phones while letting them show below. */}
      <div className="relative overflow-x-clip pb-5 pr-3">
        <div className="relative">
          {Array.from({ length: layers }, (_, i) => layers - i).map((depth) => (
            <div
              key={depth}
              aria-hidden
              className="holo-under"
              style={{ transform: `translate(${depth * 4}px, ${depth * 6}px) rotate(${depth * 0.8}deg)` }}
            />
          ))}

          <AnimatePresence mode="wait">
            <motion.div
              key={current.card.id}
              className="relative"
              // Dealt from the deck (below-right), cleared off to the left.
              initial={{ x: 14, y: 20, rotate: 2, opacity: 0 }}
              animate={{ x: 0, y: 0, rotate: 0, opacity: 1, transition: { duration: 0.65, ease: [0.22, 1, 0.36, 1] } }}
              exit={{ x: -110, rotate: -5, opacity: 0, transition: { duration: 0.45, ease: [0.4, 0, 0.2, 1] } }}
            >
              <HoloCard
                side={side}
                front={front}
                back={back}
                rarity={rarityForBox(current.box)}
                topic={current.card.topic.name}
                streak={current.correctStreak}
                position={cardPosition(sessionTotal, queue.length)}
                onFlip={() => play("flip")}
              />
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {limit && <UpgradePrompt kind={limit.kind} limit={limit.limit} />}

      {error && (
        <p className="rounded-xl border border-critical/30 bg-critical/10 px-4 py-3 text-sm text-critical">{error}</p>
      )}

      {/* Outside the card so it can stick: however long the feedback, the
          button stays in reach. On phones it sits above the bottom nav. */}
      {evaluation && (
        <div className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-30 -mx-4 bg-gradient-to-t from-canvas via-canvas/95 to-transparent px-4 pb-2 pt-6 sm:bottom-4 sm:mx-0 sm:px-0">
          {stage === "retry-offered" ? (
            // Full-width, stacked on phones; side by side from sm up.
            <div className="flex flex-col gap-2 sm:flex-row">
              <motion.button
                whileTap={{ scale: 0.98 }}
                onClick={tryAgain}
                autoFocus
                className="btn-primary w-full shadow-lg sm:w-auto"
              >
                {t("review.tryAgain")}
              </motion.button>
              <button onClick={() => void showAnswer()} className="btn-ghost w-full bg-canvas sm:w-auto">
                {t("review.showAnswer")}
              </button>
            </div>
          ) : (
            <motion.button
              whileTap={{ scale: 0.98 }}
              onClick={next}
              autoFocus
              className="btn-primary w-full shadow-lg sm:w-auto"
            >
              {t("review.next")}
            </motion.button>
          )}
        </div>
      )}
    </div>
  );
}
