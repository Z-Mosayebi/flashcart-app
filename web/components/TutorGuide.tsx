"use client";

import { usePreferences } from "@/components/PreferencesProvider";
import SpeakButton from "@/components/SpeakButton";
import RichText from "@/components/RichText";

export interface VocabItem {
  term: string;
  meaning: string;
}

/**
 * The structured parts of a tutor reply: the step bar, a short lesson, and
 * the key words (each with audio). Anything the tutor didn't send is simply
 * not drawn, so plain replies look as before.
 */
export default function TutorGuide({
  lesson,
  vocab,
  step,
  totalSteps,
}: {
  lesson?: string | null;
  vocab?: VocabItem[];
  step?: number | null;
  totalSteps?: number | null;
}) {
  const { t } = usePreferences();
  const hasSteps = typeof step === "number" && typeof totalSteps === "number" && totalSteps > 1;
  if (!lesson && !vocab?.length && !hasSteps) return null;

  return (
    <div className="mb-3 space-y-3">
      {hasSteps && (
        <div>
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-ink-faint">
            {t("tutor.step", { n: step!, total: totalSteps! })}
          </p>
          <div className="flex gap-1" aria-hidden>
            {Array.from({ length: totalSteps! }, (_, i) => (
              <span
                key={i}
                className={`h-1.5 flex-1 rounded-full ${i < step! ? "bg-gold" : "bg-line"}`}
              />
            ))}
          </div>
        </div>
      )}

      {lesson && (
        <div className="rounded-xl border border-brand/30 bg-brand-soft px-3 py-2.5">
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-brand">📘 {t("tutor.lesson")}</p>
          <p className="text-sm leading-relaxed text-ink">
            <RichText text={lesson} />
          </p>
        </div>
      )}

      {vocab && vocab.length > 0 && (
        <div>
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink-faint">📝 {t("tutor.words")}</p>
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {vocab.map((v) => (
              <li key={v.term} className="flex items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2">
                <SpeakButton text={v.term} size="sm" />
                <span className="min-w-0">
                  <span lang="de" className="block truncate font-semibold text-ink">{v.term}</span>
                  <span className="block truncate text-xs text-ink-muted">{v.meaning}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
