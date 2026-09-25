"use client";

import { useRef, useState } from "react";
import { usePreferences } from "@/components/PreferencesProvider";
import UpgradePrompt from "@/components/UpgradePrompt";
import { readLimitHit, type LimitHit } from "@/components/usePlan";

const MAX_BYTES = 2 * 1024 * 1024;
const ACCEPT = ".xlsx,.csv,.docx,.txt,.md";
/** Continuation requests for one upload (each is up to ~3 min). */
const MAX_ROUNDS = 40;

interface Result {
  documentId: string;
  status: "unchanged" | "imported" | "partial" | "failed";
  cardsCreated: number;
  error?: string;
}

/** Import a file from the computer — available to everyone, no Drive needed. */
export default function UploadPanel({ onImported }: { onImported?: () => void }) {
  const { t } = usePreferences();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [limit, setLimit] = useState<LimitHit | null>(null);

  async function upload(file: File) {
    setNotice(null);
    setError(null);
    setLimit(null);
    if (file.size > MAX_BYTES) {
      setError(t("upload.tooLarge"));
      return;
    }

    setBusy(file.name);
    try {
      const form = new FormData();
      form.append("file", file);
      let res = await fetch("/api/me/upload", { method: "POST", body: form });
      let added = 0;

      for (let round = 0; round < MAX_ROUNDS; round++) {
        const hit = await readLimitHit(res);
        if (hit) {
          setLimit(hit);
          return;
        }
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(t("upload.failed", { name: file.name, reason: data.detail ?? t("common.error") }));
          return;
        }

        const result = data.result as Result;
        added += result.cardsCreated ?? 0;
        onImported?.();

        if (result.status === "partial") {
          // Long notes are generated over several requests; keep going.
          res = await fetch(`/api/me/documents/${result.documentId}/continue`, { method: "POST" });
          continue;
        }
        if (result.status === "failed") {
          setError(t("upload.failed", { name: file.name, reason: result.error ?? t("common.error") }));
        } else if (result.status === "unchanged") {
          setNotice(t("upload.unchanged", { name: file.name }));
        } else {
          setNotice(t("upload.done", { count: added, name: file.name }));
        }
        return;
      }
    } catch {
      setError(t("common.error"));
    } finally {
      setBusy(null);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold text-ink">{t("upload.title")}</h2>
        <p className="mt-1 text-sm text-ink-muted">{t("upload.subtitle")}</p>
      </div>

      <input
        ref={input}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void upload(file);
        }}
      />
      <button onClick={() => input.current?.click()} disabled={busy !== null} className="btn-primary">
        {t("upload.choose")}
      </button>

      {busy && <p className="text-sm text-ink-muted">{t("upload.working", { name: busy })}</p>}
      {limit && <UpgradePrompt kind={limit.kind} limit={limit.limit} />}
      {error && (
        <p className="rounded-xl border border-critical/30 bg-critical/10 px-4 py-3 text-sm text-critical">{error}</p>
      )}
      {notice && !error && (
        <p className="rounded-xl border border-positive/30 bg-positive/10 px-4 py-3 text-sm text-positive">{notice}</p>
      )}
    </div>
  );
}
