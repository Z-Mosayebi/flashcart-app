import Dashboard from "@/components/Dashboard";

const DEMO_USER_ID = process.env.DEMO_USER_ID || "demo-user";

export default function DashboardPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Your progress</h1>
      <Dashboard userId={DEMO_USER_ID} />
    </div>
  );
}
