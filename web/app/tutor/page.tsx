import { redirect } from "next/navigation";
import TutorChat from "@/components/TutorChat";
import { requireUserId } from "@/lib/auth";

export default async function TutorPage() {
  const userId = await requireUserId();
  if (!userId) redirect("/signin?callbackUrl=/tutor");

  return <TutorChat />;
}
