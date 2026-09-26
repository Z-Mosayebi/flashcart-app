import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import AuthForm from "@/components/AuthForm";
import { requireUserId } from "@/lib/auth";

export default async function SignInPage() {
  const userId = await requireUserId();
  if (userId) redirect("/review");

  const googleEnabled = Boolean(
    process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
  );

  return (
    <div className="flex min-h-[70vh] items-center justify-center">
      <Suspense fallback={<div className="skeleton h-96 w-full max-w-md" />}>
        <AuthForm googleEnabled={googleEnabled} />
      </Suspense>
    </div>
  );
}

export const metadata: Metadata = {
  title: "Sign in or create a free account",
  description: "Sign in to Flashcard or create a free account to start learning German with spoken flashcards and an AI tutor.",
  alternates: { canonical: "/signin" },
};
