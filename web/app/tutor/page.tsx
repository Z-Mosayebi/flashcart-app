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
