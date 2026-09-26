import type { Metadata } from "next";
import { redirect } from "next/navigation";
import PremiumRequestForm from "@/components/PremiumRequestForm";
import PremiumHeader from "@/components/PremiumHeader";
import { requireUserId } from "@/lib/auth";

export default async function PremiumPage() {
  const userId = await requireUserId();
  if (!userId) redirect("/signin?callbackUrl=/premium");

  return (
    <div className="space-y-6">
      <PremiumHeader />
      <PremiumRequestForm />
    </div>
  );
}

// Part of the signed-in app: keep it out of search results.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};
