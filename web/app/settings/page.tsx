import type { Metadata } from "next";
import { redirect } from "next/navigation";
import SettingsPanel from "@/components/SettingsPanel";
import { requireUserId } from "@/lib/auth";

export default async function SettingsPage() {
  const userId = await requireUserId();
  if (!userId) redirect("/signin?callbackUrl=/settings");

  return <SettingsPanel />;
}

// Part of the signed-in app: keep it out of search results.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};
