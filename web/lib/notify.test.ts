import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { notifyAdmins, premiumRequestNotice } from "@/lib/notify";

const notice = { subject: "New premium request", text: "body" };

describe("notifyAdmins", () => {
  beforeEach(() => {
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "t");
    vi.stubEnv("TELEGRAM_CHAT_ID", "c");
    vi.stubEnv("RESEND_API_KEY", "r");
    vi.stubEnv("ADMIN_EMAILS", "admin@example.com");
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("still emails when Telegram is down", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        url.includes("telegram") ? Promise.reject(new Error("down")) : new Response("{}", { status: 200 })
      )
    );
    expect(await notifyAdmins(notice)).toEqual({ telegram: false, email: true });
  });

  it("still sends Telegram when email is rejected", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        url.includes("telegram") ? new Response("{}", { status: 200 }) : new Response("bad", { status: 403 })
      )
    );
    expect(await notifyAdmins(notice)).toEqual({ telegram: true, email: false });
  });

  it("does nothing, and says so, when no channel is configured", async () => {
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "");
    vi.stubEnv("RESEND_API_KEY", "");
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    expect(await notifyAdmins(notice)).toEqual({ telegram: false, email: false });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("premiumRequestNotice", () => {
  it("includes the answers, contact and admin link", () => {
    const n = premiumRequestNotice({
      name: "Sara",
      email: "sara@example.com",
      goal: "EXAM",
      level: "B1",
      willingToPay: "FROM_5_TO_10",
      contact: "@sara",
      message: null,
      adminUrl: "https://app.example/admin",
    });
    expect(n.subject).toContain("Sara");
    expect(n.text).toContain("sara@example.com");
    expect(n.text).toContain("Exam");
    expect(n.text).toContain("€5–10");
    expect(n.text).toContain("@sara");
    expect(n.text).toContain("https://app.example/admin");
  });
});
