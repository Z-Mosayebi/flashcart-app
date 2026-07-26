import ReviewSession from "@/components/ReviewSession";

// Single-user demo: in a real multi-user deploy this would come from auth.
// Kept as an env var so the seed script and app agree on who "you" are.
const DEMO_USER_ID = process.env.DEMO_USER_ID || "demo-user";

export default function ReviewPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Review</h1>
      <ReviewSession userId={DEMO_USER_ID} />
    </div>
  );
}
