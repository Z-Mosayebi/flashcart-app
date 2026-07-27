import { redirect } from "next/navigation";
import Landing from "@/components/Landing";
import { requireUserId } from "@/lib/auth";

export default async function Home() {
  // Signed-in users don't need the pitch — send them straight to work.
  const userId = await requireUserId();
  if (userId) redirect("/review");

  return <Landing />;
}
