"use client";

import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import clsx from "clsx";
import { usePreferences } from "@/components/PreferencesProvider";

interface ConnectionState {
  connected: boolean;
  oauthAvailable?: boolean;
  authType?: string;
  workspaceName?: string | null;
  workspaceIcon?: string | null;
  tokenHint?: string | null;
  pageIds?: string[];
  lastSyncedAt?: string | null;
  lastSyncError?: string | null;
}

interface NotionPage {
  id: string;
  title: string;
  url?: string;
}

interface SyncResult {
  page: string;
  status: string;
  cards?: number;
}

const NotionMark = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <path d="M4.459 4.208c.746.606 1.026.56 2.428.466l13.215-.793c.28 0 .047-.28-.046-.326L17.86 1.968c-.42-.326-.98-.7-2.052-.607L3.01 2.295c-.466.046-.56.28-.374.466zm.793 3.08v13.904c0 .747.373 1.027 1.214.98l14.523-.84c.841-.046.935-.56.935-1.167V6.354c0-.606-.233-.933-.748-.887l-15.177.887c-.56.047-.747.327-.747.933zm14.337.745c.093.42 0 .84-.42.888l-.7.14v10.263c-.608.327-1.168.514-1.635.514-.748 0-.935-.234-1.495-.933l-4.577-7.186v6.952l1.448.327s0 .84-1.168.84l-3.222.186c-.093-.186 0-.653.327-.746l.84-.233V9.854L7.822 9.76c-.094-.42.14-1.026.793-1.073l3.456-.233 4.764 7.279v-6.44l-1.215-.14c-.093-.514.28-.887.747-.933z" />
  </svg>
);

export default function NotionConnect() {
  const { t, locale } = usePreferences();
  const params = useSearchParams();

  const [state, setState] = useState<ConnectionState | null>(null);
  const [pages, setPages] = useState<NotionPage[] | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  const [token, setToken] = useState("");
  const [pageUrl, setPageUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [savingPages, setSavingPages] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<SyncResult[] | null>(null);

  // Surface the outcome of the OAuth redirect.
  useEffect(() => {
    const status = params.get("notion");
    if (!status) return;
    if (status === "cancelled") setError(t("notion.oauth.cancelled"));
    else if (status === "not_configured") setError(t("notion.oauth.notConfigured"));
    else if (status === "failed" || status === "state_mismatch") {
      setError(t("notion.oauth.failed"));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/me/notion");
      const data = await res.json();
      setState(data);
      setSelected(data.pageIds ?? []);
    } catch {
      setState({ connected: false });
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Once connected, load the page list so the user can pick without pasting URLs.
  useEffect(() => {
    if (!state?.connected) return;
    let cancelled = false;
    fetch("/api/me/notion/pages")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => {
        if (!cancelled) setPages(d.pages ?? []);
      })
      .catch(() => {
        if (!cancelled) setPages([]);
      });
    return () => {
      cancelled = true;
    };
  }, [state?.connected]);

  async function savePages(next: string[]) {
    setSelected(next);
    setSavingPages(true);
    try {
      await fetch("/api/me/notion/pages", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pageIds: next }),
      });
    } finally {
      setSavingPages(false);
    }
  }

  async function connectWithToken() {
    if (!token.trim()) return setError(t("notion.error.token"));
    if (!pageUrl.trim()) return setError(t("notion.error.page"));

    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/me/notion", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, pageUrls: [pageUrl] }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error === "invalid_page" ? t("notion.error.page") : t("notion.error.generic"));
        return;
      }
      setToken("");
      setPageUrl("");
      await refresh();
    } catch {
      setError(t("notion.error.generic"));
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    setBusy(true);
    try {
      await fetch("/api/me/notion", { method: "DELETE" });
      setResults(null);
      setPages(null);
      setSelected([]);
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function sync() {
    if (selected.length === 0) return setError(t("notion.pages.none"));
    setSyncing(true);
    setError(null);
    setResults(null);
    try {
      const res = await fetch("/api/me/notion/sync", { method: "POST" });
      const body = await res.json();
      if (!res.ok) {
        setError(body.detail || t("notion.error.generic"));
        return;
      }
      setResults(body.results ?? []);
      await refresh();
    } catch {
      setError(t("notion.error.generic"));
    } finally {
      setSyncing(false);
    }
  }

  const totalNew = results?.reduce((sum, r) => sum + (r.cards ?? 0), 0) ?? 0;

  return (
    <section className="card-surface p-5 sm:p-6">
      <h2 className="font-medium">{t("notion.title")}</h2>
      <p className="mt-1 text-sm text-ink-muted">{t("notion.subtitle")}</p>

      {state === null ? (
        <div className="mt-4 skeleton h-11 w-full" />
      ) : state.connected ? (
        <div className="mt-4 space-y-4">
          {/* Connection summary */}
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line px-4 py-3">
            <span className="flex h-2 w-2 shrink-0 rounded-full bg-positive" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">
                {state.workspaceName || t("notion.connected")}
              </p>
              <p className="truncate text-xs text-ink-faint">
                {state.lastSyncedAt
                  ? t("notion.lastSynced", {
                      when: new Date(state.lastSyncedAt).toLocaleDateString(locale),
                    })
                  : t("notion.never")}
              </p>
            </div>
            <button
              onClick={disconnect}
              disabled={busy}
              className="text-sm text-ink-muted hover:text-critical"
            >
              {t("notion.disconnect")}
            </button>
          </div>

          {/* Page picker */}
          {pages === null ? (
            <div className="skeleton h-20 w-full" />
          ) : pages.length === 0 ? (
            <p className="text-sm text-ink-muted">{t("notion.pages.empty")}</p>
          ) : (
            <div>
              <p className="mb-2 text-sm font-medium">{t("notion.pages.title")}</p>
              <div className="max-h-56 space-y-1 overflow-y-auto rounded-xl border border-line p-2">
                {pages.map((page) => {
                  const checked = selected.includes(page.id);
                  return (
                    <label
                      key={page.id}
                      className={clsx(
                        "flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                        checked ? "bg-brand-soft" : "hover:bg-surface-raised"
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) =>
                          savePages(
                            e.target.checked
                              ? [...selected, page.id]
                              : selected.filter((id) => id !== page.id)
                          )
                        }
                        className="h-4 w-4 shrink-0 accent-current text-brand"
                      />
                      <span className="truncate">{page.title}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          <button
            onClick={sync}
            disabled={syncing || savingPages || selected.length === 0}
            className="btn-primary w-full sm:w-auto"
          >
            {syncing ? t("notion.syncing") : t("notion.sync")}
          </button>

          <AnimatePresence>
            {results && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="rounded-xl border border-positive/30 bg-positive/10 px-4 py-3 text-sm"
              >
                <p className="font-medium text-positive">
                  {totalNew > 0 ? t("notion.cardsAdded", { count: totalNew }) : t("notion.upToDate")}
                </p>
                <ul className="mt-1.5 space-y-0.5 text-xs text-ink-muted">
                  {results.map((r, i) => (
                    <li key={i}>
                      {r.page} — {r.status}
                      {typeof r.cards === "number" ? ` (${r.cards})` : ""}
                    </li>
                  ))}
                </ul>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          {/* Primary path: one-click OAuth */}
          {state.oauthAvailable && !showAdvanced && (
            <div>
              <a href="/api/me/notion/oauth/start" className="btn-primary w-full sm:w-auto">
                <NotionMark />
                {t("notion.oauth.connect")}
              </a>
              <p className="mt-2 text-xs text-ink-faint">{t("notion.oauth.hint")}</p>
            </div>
          )}

          {/* Fallback: manual integration token */}
          {(!state.oauthAvailable || showAdvanced) && (
            <div className="space-y-3">
              {/* Step-by-step help. Collapsed by default so it doesn't shout at
                  people who already know the flow. */}
              <div className="rounded-xl border border-line bg-surface-raised/50">
                <button
                  type="button"
                  onClick={() => setShowHelp((s) => !s)}
                  aria-expanded={showHelp}
                  className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left text-sm font-medium"
                >
                  {t("notion.help.toggle")}
                  <motion.svg
                    animate={{ rotate: showHelp ? 180 : 0 }}
                    transition={{ duration: 0.2 }}
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="shrink-0 text-ink-faint"
                  >
                    <polyline points="6 9 12 15 18 9" />
                  </motion.svg>
                </button>

                <AnimatePresence initial={false}>
                  {showHelp && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                      className="overflow-hidden"
                    >
                      <div className="space-y-3 px-4 pb-4 text-sm">
                        <ol className="space-y-2.5">
                          {[
                            "notion.help.step1",
                            "notion.help.step2",
                            "notion.help.step3",
                            "notion.help.step4",
                          ].map((key, i) => (
                            <li key={key} className="flex gap-3">
                              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand text-[11px] font-medium text-white">
                                {i + 1}
                              </span>
                              <span
                                className="text-ink-muted [&_b]:font-medium [&_b]:text-ink [&_code]:rounded [&_code]:bg-surface [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-xs"
                                // Steps contain <b>/<code> emphasis from the
                                // locale files only — no user input reaches here.
                                dangerouslySetInnerHTML={{ __html: t(key as "notion.help.step1") }}
                              />
                            </li>
                          ))}
                        </ol>

                        <p className="rounded-lg border border-caution/30 bg-caution/10 px-3 py-2 text-xs text-ink">
                          {t("notion.help.warning")}
                        </p>

                        <a
                          href="https://www.notion.so/my-integrations"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 text-xs font-medium text-brand hover:underline"
                        >
                          {t("notion.help.open")}
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                            <polyline points="15 3 21 3 21 9" />
                            <line x1="10" y1="14" x2="21" y2="3" />
                          </svg>
                        </a>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <div>
                <label className="mb-1.5 block text-sm text-ink-muted" htmlFor="notion-token">
                  {t("notion.token")}
                </label>
                <input
                  id="notion-token"
                  type="password"
                  autoComplete="off"
                  placeholder="secret_…"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  className="field font-mono text-sm"
                />
                <p className="mt-1.5 text-xs text-ink-faint">{t("notion.tokenHint")}</p>
              </div>

              <div>
                <label className="mb-1.5 block text-sm text-ink-muted" htmlFor="notion-page">
                  {t("notion.pageUrl")}
                </label>
                <input
                  id="notion-page"
                  type="url"
                  placeholder="https://notion.so/…"
                  value={pageUrl}
                  onChange={(e) => setPageUrl(e.target.value)}
                  className="field text-sm"
                />
              </div>

              <button onClick={connectWithToken} disabled={busy} className="btn-primary w-full sm:w-auto">
                {busy ? t("common.loading") : t("notion.connect")}
              </button>
            </div>
          )}

          {state.oauthAvailable && (
            <button
              onClick={() => {
                setShowAdvanced((s) => !s);
                setError(null);
              }}
              className="text-xs text-ink-faint underline underline-offset-4 hover:text-ink-muted"
            >
              {showAdvanced ? t("notion.advanced.hide") : t("notion.advanced")}
            </button>
          )}
        </div>
      )}

      {(error || state?.lastSyncError) && (
        <p className="mt-3 rounded-xl border border-critical/30 bg-critical/10 px-4 py-2.5 text-sm text-critical">
          {error ?? state?.lastSyncError}
        </p>
      )}
    </section>
  );
}
