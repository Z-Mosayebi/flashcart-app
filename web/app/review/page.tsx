import type { Metadata } from "next";
import { redirect } from "next/navigation";
import ReviewSession from "@/components/ReviewSession";
import { requireUserId } from "@/lib/auth";

export default async function ReviewPage() {
  const userId = await requireUserId();
  if (!userId) redirect("/signin?callbackUrl=/review");

  return <ReviewSession />;
}

// Part of the signed-in app: keep it out of search results.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};
