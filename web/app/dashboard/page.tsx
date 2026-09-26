import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Dashboard from "@/components/Dashboard";
import { requireUserId } from "@/lib/auth";

export default async function DashboardPage() {
  const userId = await requireUserId();
  if (!userId) redirect("/signin?callbackUrl=/dashboard");

  return <Dashboard />;
}

// Part of the signed-in app: keep it out of search results.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};
