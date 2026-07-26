import Link from "next/link";

export default function Home() {
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Learn German the way you actually made mistakes.</h1>
      <p className="text-neutral-400">
        Flashcart turns your raw Notion grammar notes into Leitner-method flashcards, quizzes you
        with an AI tutor until you can produce the sentences yourself, and tracks mastery per
        grammar pattern on a dashboard.
      </p>
      <div className="flex gap-4">
        <Link href="/review" className="bg-white text-black px-4 py-2 rounded-md font-medium">
          Start reviewing
        </Link>
        <Link href="/dashboard" className="border border-neutral-700 px-4 py-2 rounded-md font-medium">
          View dashboard
        </Link>
      </div>
    </div>
  );
}
