"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { signIn } from "next-auth/react";
import { motion, AnimatePresence } from "framer-motion";
import clsx from "clsx";
import { usePreferences } from "@/components/PreferencesProvider";

interface DriveDocument {
  id: string;
  externalId: string;
  title: string;
  mimeType: string | null;
  status: "PENDING" | "IMPORTING" | "COMPLETE" | "FAILED";
  sectionsDone: number;
  sectionsTotal: number;
  lastSyncedAt: string | null;
  lastError: string | null;
  topicCount: number;
  readOnly: boolean;
}

interface DriveState {
  available: boolean;
  connected: boolean;
  lastSyncedAt: string | null;
  lastError: string | null;
  documents: DriveDocument[];
}

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string;
  supported: boolean;
  unsupportedReason?: string;
}

/** While an import runs, poll for progress so the section counter advances. */
const PROGRESS_POLL_MS = 2_500;

const DriveMark = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <path d="M7.71 3.5 1.15 15l3.43 5.95L11.14 9.5zm8.58 0H9.43l6.56 11.5h6.86zM6.5 16.5 3.07 22.45h13.14L19.64 16.5z" />
  </svg>
);

function iconFor(mimeType: string | null): string {
  if (!mimeType) return "📄";
  if (mimeType.includes("spreadsheet")) return "📊";
  if (mimeType.includes("wordprocessing")) return "📝";
  return "📄";
}

export default function DriveConnect() {
  const { t, locale } = usePreferences();

  const [state, setState] = useState<DriveState | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [files, setFiles] = useState<DriveFile[] | null>(null);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const formatDate = useCallback(
    (iso: string | null) =>
      iso
        ? new Date(iso).toLocaleString(locale === "de" ? "de-DE" : "en-GB", {
            dateStyle: "medium",
            timeStyle: "short",
          })
        : null,
    [locale]
  );

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/me/drive", { cache: "no-store" });
      if (!res.ok) throw new Error();
      setState(await res.json());
    } catch {
      setError(t("drive.error.generic"));
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  // An import writes progress to the database as it goes, so polling shows a
  // real section count. Polling stops as soon as nothing is in flight, rather
  // than running for the life of the page.
  const hasRunningImport = useMemo(
    () => state?.documents.some((d) => d.status === "IMPORTING" || d.status === "PENDING") ?? false,
    [state]
  );

  useEffect(() => {
    if (!hasRunningImport) return;
    const timer = setInterval(() => void load(), PROGRESS_POLL_MS);
    return () => clearInterval(timer);
  }, [hasRunningImport, load]);

  const searchTimer = useRef<ReturnType<typeof setTimeout>>();

  const fetchFiles = useCallback(
    async (query: string) => {
      setFiles(null);
      setError(null);
      try {
        const params = query.trim() ? `?q=${encodeURIComponent(query.trim())}` : "";
        const res = await fetch(`/api/me/drive/files${params}`, { cache: "no-store" });
        const data = await res.json();

        if (res.status === 403) {
          setError(t("drive.error.unauthorized"));
          setFiles([]);
          return;
        }
        if (!res.ok) throw new Error(data?.detail);

        setFiles(data.files ?? []);
      } catch {
        setError(t("drive.error.generic"));
        setFiles([]);
      }
    },
    [t]
  );

  const openPicker = () => {
    setPickerOpen(true);
    setSelected([]);
    setSearch("");
    void fetchFiles("");
  };

  const onSearchChange = (value: string) => {
    setSearch(value);
    // Debounced: each keystroke would otherwise be a Drive API call.
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => void fetchFiles(value), 350);
  };

  const toggle = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const startImport = async (fileIds: string[]) => {
    if (fileIds.length === 0) return;

    setImporting(true);
    setError(null);
    setNotice(t("drive.import.started"));
    setPickerOpen(false);

    try {
      const res = await fetch("/api/me/drive/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileIds }),
      });
      const data = await res.json();

      if (res.status === 403) {
        setError(t("drive.error.unauthorized"));
        setNotice(null);
        return;
      }
      if (!res.ok) throw new Error(data?.detail);

      const results = (data.results ?? []) as {
        status: string;
        cardsCreated: number;
        error?: string;
      }[];

      const added = results.reduce((sum, r) => sum + (r.cardsCreated ?? 0), 0);
      const failed = results.filter((r) => r.status === "failed");

      if (failed.length === results.length) {
        setError(failed[0]?.error ?? t("drive.error.generic"));
        setNotice(null);
      } else if (added === 0) {
        setNotice(t("drive.import.unchanged"));
      } else if (failed.length > 0) {
        setNotice(t("drive.import.partial", { count: added }));
      } else {
        setNotice(t("drive.import.done", { count: added }));
      }
    } catch {
      setError(t("drive.error.generic"));
      setNotice(null);
    } finally {
      setImporting(false);
      void load();
    }
  };

  const removeDocument = async (documentId: string) => {
    await fetch(`/api/me/drive/import?documentId=${documentId}`, { method: "DELETE" });
    void load();
  };

  const revoke = async () => {
    await fetch("/api/me/drive", { method: "DELETE" });
    setNotice(null);
    void load();
  };

  if (!state) {
    return <p className="text-sm text-slate-500 dark:text-slate-400">{t("common.loading")}</p>;
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900 dark:text-slate-100">
          <DriveMark />
          {t("drive.title")}
        </h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{t("drive.subtitle")}</p>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-500">{t("drive.supported")}</p>
      </div>

      {!state.available && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
          {t("drive.notAvailable")}
        </p>
      )}

      {/* Not connected is not an error state: it just means the sign-in that
          grants Drive hasn't happened yet, and the fix is to sign in again. */}
      {state.available && !state.connected && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/50">
          <p className="font-medium text-slate-900 dark:text-slate-100">
            {t("drive.notConnected.title")}
          </p>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            {t("drive.notConnected.body")}
          </p>
          <button
            onClick={() => signIn("google")}
            className="mt-3 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
          >
            {t("drive.notConnected.cta")}
          </button>
        </div>
      )}

      {state.available && state.connected && (
        <button
          onClick={openPicker}
          disabled={importing}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
        >
          {t("drive.picker.open")}
        </button>
      )}

      {error && (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-950/40 dark:text-rose-200">
          {error}
        </p>
      )}
      {notice && !error && (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200">
          {notice}
        </p>
      )}

      {state.documents.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-slate-900 dark:text-slate-100">
            {t("drive.documents.title")}
          </h3>
          <ul className="mt-2 space-y-2">
            {state.documents.map((doc) => (
              <li
                key={doc.id}
                className="rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-700"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                      <span className="mr-1.5">{iconFor(doc.mimeType)}</span>
                      {doc.title}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                      <DocumentStatus doc={doc} t={t} formatDate={formatDate} />
                    </p>
                    {doc.readOnly && (
                      <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">
                        {t("drive.documents.legacy")}
                      </p>
                    )}
                  </div>

                  <div className="flex shrink-0 gap-2">
                    {!doc.readOnly && state.connected && (
                      <button
                        onClick={() => void startImport([doc.externalId])}
                        disabled={importing || doc.status === "IMPORTING"}
                        className="text-xs text-slate-600 hover:text-slate-900 disabled:opacity-40 dark:text-slate-400 dark:hover:text-slate-100"
                      >
                        {t("drive.documents.reimport")}
                      </button>
                    )}
                    <button
                      onClick={() => void removeDocument(doc.id)}
                      className="text-xs text-slate-500 hover:text-rose-600 dark:text-slate-400 dark:hover:text-rose-400"
                    >
                      {t("drive.documents.remove")}
                    </button>
                  </div>
                </div>

                {doc.status === "IMPORTING" && doc.sectionsTotal > 0 && (
                  <div className="mt-2 h-1 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                    <motion.div
                      className="h-full bg-slate-900 dark:bg-slate-100"
                      initial={{ width: 0 }}
                      animate={{ width: `${(doc.sectionsDone / doc.sectionsTotal) * 100}%` }}
                      transition={{ duration: 0.4 }}
                    />
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {state.connected && (
        <div className="border-t border-slate-200 pt-4 dark:border-slate-700">
          <button
            onClick={() => void revoke()}
            className="text-sm text-slate-500 hover:text-rose-600 dark:text-slate-400 dark:hover:text-rose-400"
          >
            {t("drive.disconnect")}
          </button>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-500">
            {t("drive.disconnect.hint")}
          </p>
        </div>
      )}

      <AnimatePresence>
        {pickerOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
            onClick={() => setPickerOpen(false)}
          >
            <motion.div
              initial={{ scale: 0.97, y: 8 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.97, y: 8 }}
              onClick={(e) => e.stopPropagation()}
              className="flex max-h-[80vh] w-full max-w-lg flex-col rounded-xl bg-white shadow-xl dark:bg-slate-900"
            >
              <div className="border-b border-slate-200 p-4 dark:border-slate-700">
                <h3 className="font-semibold text-slate-900 dark:text-slate-100">
                  {t("drive.picker.title")}
                </h3>
                <input
                  autoFocus
                  value={search}
                  onChange={(e) => onSearchChange(e.target.value)}
                  placeholder={t("drive.picker.search")}
                  className="mt-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                />
              </div>

              <div className="flex-1 overflow-y-auto p-2">
                {files === null && (
                  <p className="p-4 text-sm text-slate-500">{t("drive.picker.loading")}</p>
                )}
                {files?.length === 0 && (
                  <p className="p-4 text-sm text-slate-500">
                    {search.trim()
                      ? t("drive.picker.emptySearch", { query: search.trim() })
                      : t("drive.picker.empty")}
                  </p>
                )}
                {files?.map((file) => (
                  <button
                    key={file.id}
                    onClick={() => file.supported && toggle(file.id)}
                    disabled={!file.supported}
                    className={clsx(
                      "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left",
                      file.supported
                        ? "hover:bg-slate-100 dark:hover:bg-slate-800"
                        : "cursor-not-allowed opacity-50",
                      selected.includes(file.id) && "bg-slate-100 dark:bg-slate-800"
                    )}
                  >
                    <input
                      type="checkbox"
                      readOnly
                      checked={selected.includes(file.id)}
                      disabled={!file.supported}
                      className="pointer-events-none"
                    />
                    <span>{iconFor(file.mimeType)}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-slate-900 dark:text-slate-100">
                        {file.name}
                      </span>
                      {!file.supported && file.unsupportedReason && (
                        <span className="block text-xs text-slate-500">
                          {file.unsupportedReason}
                        </span>
                      )}
                    </span>
                  </button>
                ))}
              </div>

              <div className="flex items-center justify-between gap-3 border-t border-slate-200 p-4 dark:border-slate-700">
                <span className="text-sm text-slate-500">
                  {selected.length > 0 && t("drive.picker.selected", { count: selected.length })}
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPickerOpen(false)}
                    className="rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                  >
                    {t("drive.picker.cancel")}
                  </button>
                  <button
                    onClick={() => void startImport(selected)}
                    disabled={selected.length === 0}
                    className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40 dark:bg-slate-100 dark:text-slate-900"
                  >
                    {t("drive.picker.import")}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Import state in one line, specific enough to be worth reading. */
function DocumentStatus({
  doc,
  t,
  formatDate,
}: {
  doc: DriveDocument;
  t: (key: any, vars?: Record<string, string | number>) => string;
  formatDate: (iso: string | null) => string | null;
}) {
  if (doc.status === "IMPORTING") {
    return (
      <>
        {doc.sectionsTotal > 0
          ? t("drive.status.importing", { done: doc.sectionsDone, total: doc.sectionsTotal })
          : t("drive.status.importingStart")}
      </>
    );
  }
  if (doc.status === "PENDING") return <>{t("drive.status.pending")}</>;
  if (doc.status === "FAILED") {
    return (
      <span className="text-rose-600 dark:text-rose-400">
        {doc.lastError || t("drive.status.failed")}
      </span>
    );
  }

  const when = formatDate(doc.lastSyncedAt);
  return (
    <>
      {t("drive.documents.topics", { count: doc.topicCount })}
      {when ? ` · ${t("drive.status.complete", { when })}` : ""}
    </>
  );
}
