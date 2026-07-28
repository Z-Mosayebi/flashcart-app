/**
 * Transactional email.
 *
 * Uses Resend's HTTP API rather than SMTP so there's no extra dependency and
 * nothing to keep open in a serverless function. Configuration is optional: if
 * RESEND_API_KEY is unset the message is logged to the server console instead
 * of being sent, which keeps local development working without an account.
 * That fallback is deliberately loud, so a misconfigured production deploy is
 * obvious in the logs rather than silently dropping password resets.
 */

const RESEND_ENDPOINT = "https://api.resend.com/emails";

/** Resend's shared sender, usable before you've verified your own domain. */
const DEFAULT_FROM = "Flashcart <onboarding@resend.dev>";

export interface SendMailInput {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export function mailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

/**
 * Sends a message. Resolves false when delivery failed or is unconfigured —
 * callers decide what to do, since for password resets we still respond with
 * the same neutral message either way.
 */
export async function sendMail({ to, subject, html, text }: SendMailInput): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM || DEFAULT_FROM;

  if (!apiKey) {
    console.warn(
      `[mail] RESEND_API_KEY not set — not sending "${subject}" to ${to}.\n` +
        `[mail] Message body:\n${text}`
    );
    return false;
  }

  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from, to: [to], subject, html, text }),
    });

    if (!res.ok) {
      // Log the provider's reason (bad key, unverified domain, rate limit) but
      // never surface it to the caller — it would leak configuration details.
      console.error(`[mail] Resend rejected the message (${res.status}):`, await res.text());
      return false;
    }
    return true;
  } catch (err) {
    console.error("[mail] Could not reach Resend:", err);
    return false;
  }
}

/** Wraps body copy in the minimal shell used by all Flashcart emails. */
function layout(heading: string, bodyHtml: string): string {
  return `<!doctype html>
<html>
  <body style="margin:0;padding:24px;background:#fafaf9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1c1917;">
    <div style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #e7e5e4;border-radius:16px;padding:32px;">
      <p style="margin:0 0 24px;font-size:18px;font-weight:600;letter-spacing:-0.01em;">Flashcart</p>
      <h1 style="margin:0 0 16px;font-size:22px;font-weight:600;letter-spacing:-0.02em;">${heading}</h1>
      ${bodyHtml}
    </div>
  </body>
</html>`;
}

/**
 * Password reset email. `resetUrl` already contains the single-use token, so
 * this text is the only place it ever appears.
 */
export function passwordResetEmail(resetUrl: string, minutesValid: number) {
  const subject = "Reset your Flashcart password";

  const html = layout(
    "Reset your password",
    `<p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#57534e;">
       Click the button below to choose a new password. This link works once and
       expires in ${minutesValid} minutes.
     </p>
     <a href="${resetUrl}"
        style="display:inline-block;background:#4f46e5;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:12px 24px;border-radius:12px;">
       Choose a new password
     </a>
     <p style="margin:24px 0 0;font-size:13px;line-height:1.6;color:#78716c;">
       If the button doesn't work, paste this into your browser:<br />
       <span style="word-break:break-all;color:#4f46e5;">${resetUrl}</span>
     </p>
     <p style="margin:24px 0 0;font-size:13px;line-height:1.6;color:#78716c;">
       Didn't ask for this? You can ignore this email — your password stays as it is.
     </p>`
  );

  const text = `Reset your Flashcart password

Open this link to choose a new password. It works once and expires in ${minutesValid} minutes:

${resetUrl}

Didn't ask for this? Ignore this email — your password stays as it is.`;

  return { subject, html, text };
}
