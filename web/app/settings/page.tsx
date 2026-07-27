import { redirect } from "next/navigation";
import SettingsPanel from "@/components/SettingsPanel";
import { requireUserId } from "@/lib/auth";

export default async function SettingsPage() {
  const userId = await requireUserId();
  if (!userId) redirect("/signin?callbackUrl=/settings");

  return <SettingsPanel />;
}
