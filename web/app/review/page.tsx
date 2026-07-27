import { redirect } from "next/navigation";
import ReviewSession from "@/components/ReviewSession";
import { requireUserId } from "@/lib/auth";

export default async function ReviewPage() {
  const userId = await requireUserId();
  if (!userId) redirect("/signin?callbackUrl=/review");

  return <ReviewSession />;
}
