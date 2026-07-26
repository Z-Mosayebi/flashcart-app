"use client";

import { useEffect, useState, useCallback } from "react";
import clsx from "clsx";

interface Card {
  id: string;
  type: string;
  prompt: string;
  answer: string;
  explanation: string | null;
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

export default function ReviewSession({ userId }: { userId: string }) {
  const [queue, setQueue] = useState<DueCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [answer, setAnswer] = useState("");
  const [evaluation, setEvaluation] = useState<Evaluation | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showHint, setShowHint] = useState(false);

  const loadQueue = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/cards/due?userId=${userId}&limit=15`);
    const data = await res.json();
    setQueue(data.cards ?? []);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    loadQueue();
  }, [loadQueue]);

  const current = queue[0];

  async function submit() {
    if (!current || !answer.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/review/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, cardId: current.card.id, userAnswer: answer }),
      });
      const data = await res.json();
      setEvaluation(data.evaluation);
    } finally {
      setSubmitting(false);
    }
  }

  function next() {
    setQueue((q) => q.slice(1));
    setAnswer("");
    setEvaluation(null);
    setShowHint(false);
  }

  if (loading) return <p className="text-neutral-400">Loading due cards…</p>;

  if (!current) {
    return (
      <div className="text-center py-16">
        <p className="text-xl font-medium">All caught up.</p>
        <p className="text-neutral-400 mt-2">No cards due right now — check back later.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between text-sm text-neutral-400">
        <span>{current.card.topic.name}</span>
        <span>{queue.length} left in this session</span>
      </div>

      <div className="border border-neutral-800 rounded-lg p-6 space-y-4">
        <p className="text-lg">{current.card.prompt}</p>

        {current.card.hints.length > 0 && !evaluation && (
          <button
            className="text-xs text-neutral-500 underline"
            onClick={() => setShowHint((s) => !s)}
          >
            {showHint ? "Hide hint" : "Show hint"}
          </button>
        )}
        {showHint && !evaluation && (
          <p className="text-sm text-neutral-400 italic">{current.card.hints.join(" · ")}</p>
        )}

        {!evaluation ? (
          <>
            <textarea
              className="w-full bg-neutral-900 border border-neutral-700 rounded-md p-3 text-sm"
              rows={3}
              placeholder="Type your answer in German…"
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
            />
            <button
              onClick={submit}
              disabled={submitting || !answer.trim()}
              className="bg-white text-black px-4 py-2 rounded-md font-medium disabled:opacity-40"
            >
              {submitting ? "Checking…" : "Submit"}
            </button>
          </>
        ) : (
          <div className="space-y-3">
            <div
              className={clsx("rounded-md px-4 py-3 text-sm", {
                "bg-green-950 text-green-300 border border-green-800": evaluation.result === "CORRECT",
                "bg-yellow-950 text-yellow-300 border border-yellow-800": evaluation.result === "PARTIAL",
                "bg-red-950 text-red-300 border border-red-800": evaluation.result === "INCORRECT",
              })}
            >
              <p className="font-medium mb-1">{evaluation.result}</p>
              <p>{evaluation.feedback}</p>
              {evaluation.errorTags.length > 0 && (
                <p className="mt-2 text-xs opacity-70">Tags: {evaluation.errorTags.join(", ")}</p>
              )}
            </div>
            {current.card.explanation && (
              <p className="text-xs text-neutral-500">{current.card.explanation}</p>
            )}
            <button onClick={next} className="bg-white text-black px-4 py-2 rounded-md font-medium">
              Next card
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
