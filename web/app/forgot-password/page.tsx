import { Suspense } from "react";
import { redirect } from "next/navigation";
import ForgotPasswordForm from "@/components/ForgotPasswordForm";
import { requireUserId } from "@/lib/auth";

export default async function ForgotPasswordPage() {
  // Someone already signed in has no use for this page.
  const userId = await requireUserId();
  if (userId) redirect("/review");

  return (
    <div className="flex min-h-[70vh] items-center justify-center">
      <Suspense fallback={<div className="skeleton h-72 w-full max-w-md" />}>
        <ForgotPasswordForm />
      </Suspense>
    </div>
  );
}
