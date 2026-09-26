/**
 * Tells the admin about things that need a human: new premium requests.
 *
 * Telegram and email are independent channels. Each is tried on its own, a
 * failure in one never stops the other, and nothing here throws — the caller's
 * work (saving a request) has already succeeded and must not be undone by a
 * notification problem. The admin dashboard is the source of truth.
 */

import { mailConfigured, sendMail } from "@/lib/mail";
import { parseAdminEmails } from "@/lib/plans";
import { GOAL_LABELS, PAY_LABELS, type Goal, type Level, type PayOption } from "@/lib/premium";

export interface AdminNotice {
  subject: string;
  text: string;
}

const TIMEOUT_MS = 8_000;

function telegramConfigured(): boolean {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID);
}

export async function sendTelegram(text: string): Promise<boolean> {
  if (!telegramConfigured()) return false;
  try {
    const res = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // Plain text: no parse_mode, so user-typed characters need no escaping.
      body: JSON.stringify({
        chat_id: process.env.TELEGRAM_CHAT_ID,
        text,
        disable_web_page_preview: true,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      console.error(`[notify] Telegram rejected the message (${res.status})`);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[notify] Could not reach Telegram:", err);
    return false;
  }
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

async function emailAdmins(notice: AdminNotice): Promise<boolean> {
  const to = parseAdminEmails(process.env.ADMIN_EMAILS);
  // Unconfigured mail would log the body — which holds a user's contact
  // details — to the server console, so skip it rather than fall back.
  if (!mailConfigured() || to.length === 0) return false;
  const html = `<pre style="font-family:inherit;white-space:pre-wrap">${escapeHtml(notice.text)}</pre>`;
  const results = await Promise.all(to.map((address) => sendMail({ to: address, subject: notice.subject, text: notice.text, html })));
  return results.every(Boolean);
}

export async function notifyAdmins(notice: AdminNotice): Promise<{ telegram: boolean; email: boolean }> {
  const [telegram, email] = await Promise.allSettled([
    sendTelegram(`${notice.subject}\n\n${notice.text}`),
    emailAdmins(notice),
  ]);
  return {
    telegram: telegram.status === "fulfilled" && telegram.value,
    email: email.status === "fulfilled" && email.value,
  };
}

export function premiumRequestNotice(p: {
  name: string | null;
  email: string;
  goal: Goal;
  level: Level;
  willingToPay: PayOption;
  contact: string | null;
  message: string | null;
  adminUrl: string;
}): AdminNotice {
  const who = p.name || p.email;
  return {
    subject: `New premium request: ${who}`,
    text: [
      `Name: ${p.name ?? "—"}`,
      `Email: ${p.email}`,
      `Goal: ${GOAL_LABELS[p.goal]}`,
      `Level: ${p.level === "UNKNOWN" ? "Not sure" : p.level}`,
      `Would pay: ${PAY_LABELS[p.willingToPay]}`,
      `Contact: ${p.contact ?? "—"}`,
      p.message ? `Message: ${p.message}` : null,
      "",
      `Review it: ${p.adminUrl}`,
    ]
      .filter((line) => line !== null)
      .join("\n"),
  };
}
