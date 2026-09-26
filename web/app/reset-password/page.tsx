import type { Metadata } from "next";
import { Suspense } from "react";
import ResetPasswordForm from "@/components/ResetPasswordForm";

/**
 * The reset link is followed while signed out, but we deliberately don't
 * redirect signed-in users away: someone resetting a password they suspect is
 * compromised may well still have a live session in the same browser.
 */
export default function ResetPasswordPage() {
  return (
    <div className="flex min-h-[70vh] items-center justify-center">
      <Suspense fallback={<div className="skeleton h-72 w-full max-w-md" />}>
        <ResetPasswordForm />
      </Suspense>
    </div>
  );
}

// Part of the signed-in app: keep it out of search results.
export const metadata: Metadata = {
  title: "Reset password",
  robots: { index: false, follow: false },
};
