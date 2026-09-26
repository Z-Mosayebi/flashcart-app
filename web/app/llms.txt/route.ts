import { SITE_URL } from "@/lib/site";

// A plain-text summary for AI assistants (llmstxt.org). Built from SITE_URL so
// the links follow the production domain.
export const dynamic = "force-static";

export function GET() {
  const body = `# Flashcard

> Flashcard is a free web app for learning to speak German. It turns a learner's own notes (typed, uploaded Excel/CSV/Word files, or Google Docs) into spoken German flashcards, grades free-text answers with AI, and offers an AI tutor that teaches grammar and vocabulary step by step until the learner can build the sentence on their own.

## What it does

- Spoken flashcards: every German prompt is read aloud, so learners train listening and pronunciation along with reading.
- AI answer checking: learners answer in their own words and get feedback on word order, cases, articles and verb forms, tagged by error type.
- AI tutor: opens on the exact card the learner missed, gives a short grammar lesson and key vocabulary, then builds the sentence in steps; it asks rather than dictates the answer.
- Spaced repetition: a Leitner system blended with the AI's judgement of how hard the answer was.
- Game elements: XP, levels, daily goals and streaks.
- Interface in English and German; works in any browser on phone, tablet or desktop.

## Who it is for

Learners of German from A1 to B2, especially adults who study from their own class notes and want to practise producing sentences, not just recognising them.

## Pricing

Free plan with daily limits. A premium plan with higher limits is currently offered as a free trial on request.

## Links

- Home: ${SITE_URL}/
- Sign up / sign in: ${SITE_URL}/signin
- Creator: Parastoo Mosayebi — https://parastoomosayebi.de
`;
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
