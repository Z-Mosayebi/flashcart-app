import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import TutorChat from "@/components/TutorChat";
import { requireUserId } from "@/lib/auth";

export default async function TutorPage() {
  const userId = await requireUserId();
  if (!userId) redirect("/signin?callbackUrl=/tutor");

  // TutorChat reads ?topic= (useSearchParams), which needs a Suspense boundary.
  return (
    <Suspense fallback={<div className="skeleton h-64 w-full" />}>
      <TutorChat />
    </Suspense>
  );
}

// Part of the signed-in app: keep it out of search results.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};
