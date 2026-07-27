import { redirect } from "next/navigation";
import Dashboard from "@/components/Dashboard";
import { requireUserId } from "@/lib/auth";

export default async function DashboardPage() {
  const userId = await requireUserId();
  if (!userId) redirect("/signin?callbackUrl=/dashboard");

  return <Dashboard />;
}
