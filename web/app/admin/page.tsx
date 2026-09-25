import { redirect } from "next/navigation";
import AdminDashboard from "@/components/AdminDashboard";
import { requireUserId } from "@/lib/auth";
import { isAdminUser } from "@/lib/admin";

export const dynamic = "force-dynamic";

/**
 * Admin dashboard. Anyone else — signed out or signed in — is quietly sent to
 * their own dashboard: no error page, nothing that reveals this page exists.
 */
export default async function AdminPage() {
  const userId = await requireUserId();
  if (!(await isAdminUser(userId))) redirect("/dashboard");

  return <AdminDashboard />;
}
