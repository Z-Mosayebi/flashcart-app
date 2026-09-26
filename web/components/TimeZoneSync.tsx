"use client";

import { useEffect } from "react";
import { useSession } from "next-auth/react";

const SYNCED_KEY = "flashcard:tz-synced";

/**
 * Reports the browser's time zone once per browser session after sign-in,
 * so daily limits and the streak reset at the user's own midnight. Renders
 * nothing; any failure just leaves the server on its fallback zone.
 */
export default function TimeZoneSync() {
  const { status } = useSession();

  useEffect(() => {
    if (status !== "authenticated") return;
    try {
      const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (!timeZone || sessionStorage.getItem(SYNCED_KEY) === timeZone) return;
      fetch("/api/me/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ timeZone }),
      })
        .then((res) => {
          if (res.ok) sessionStorage.setItem(SYNCED_KEY, timeZone);
        })
        .catch(() => {});
    } catch {
      /* storage or Intl unavailable — the server keeps its fallback zone */
    }
  }, [status]);

  return null;
}
