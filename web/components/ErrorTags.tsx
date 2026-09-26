"use client";

import { useState } from "react";
import clsx from "clsx";
import { AnimatePresence, motion } from "framer-motion";
import { usePreferences } from "@/components/PreferencesProvider";
import { tagExplanation, tagLabel } from "@/lib/error-tags";

/**
 * The grader's error tags as tappable chips. Tapping one shows what that kind
 * of mistake means; tapping it again (or another tag) closes it.
 */
export default function ErrorTags({ tags }: { tags: string[] }) {
  const { t, locale } = usePreferences();
  const [open, setOpen] = useState<string | null>(null);
  if (tags.length === 0) return null;

  const explanation = open ? tagExplanation(open, locale) : null;

  return (
    <div className="mt-3 space-y-2">
      <div className="flex flex-wrap gap-2">
        {tags.map((tag) => {
          const active = open === tag;
          return (
            <button
              key={tag}
              type="button"
              aria-expanded={active}
              onClick={() => setOpen(active ? null : tag)}
              className={clsx(
                // min-h-9 keeps the chip comfortably tappable on phones.
                "inline-flex min-h-9 items-center gap-1 rounded-full border px-3 text-xs transition-colors",
                active
                  ? "border-brand bg-brand text-white"
                  : "border-line bg-surface text-ink-muted hover:text-ink"
              )}
            >
              {tagLabel(tag, locale)}
              <span aria-hidden className="text-[10px] opacity-70">
                {active ? "▲" : "ⓘ"}
              </span>
            </button>
          );
        })}
      </div>

      <AnimatePresence initial={false}>
        {explanation && (
          <motion.p
            key={open}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden rounded-lg bg-surface px-3 py-2 text-xs leading-relaxed text-ink-muted"
            role="note"
            aria-label={t("review.tagExplanation")}
          >
            {explanation}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}
