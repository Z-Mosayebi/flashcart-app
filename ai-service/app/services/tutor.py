"""
The tutoring evaluation loop: grade a learner's free-text German answer against
the card's expected answer/pattern, produce human feedback, tag the error type,
and estimate a difficulty score used by the Leitner scheduler.

This is deliberately NOT exact-string matching — German has legitimate answer
variation (word order flexibility, synonym choice like weswegen/weshalb/warum),
so grading is delegated to the model with explicit grading criteria.
"""

from app.models.schemas import EvaluateAnswerRequest, EvaluateAnswerResponse
from app.services.llm_client import ask_json

SYSTEM_PROMPT = """You are a strict but encouraging German grammar tutor grading a learner's \
answer to a flashcard. You will be given the card's prompt, the expected/reference answer, the \
grammar pattern being tested (if any), and the learner's actual answer.

Grade holistically, not by exact string match:
- Minor spelling/typo issues that don't affect grammar correctness -> still CORRECT.
- Correct grammar/meaning but using a valid synonym or slightly different phrasing than the \
  reference answer -> CORRECT.
- Right idea but with a genuine grammar mistake (wrong case, wrong word order, wrong verb form, \
  missing/wrong article, wrong preposition) -> PARTIAL if the core structure is mostly right, \
  INCORRECT if the grammar point being tested is clearly wrong or missing entirely.
- Completely off-topic, blank-equivalent, or wrong language -> INCORRECT.

Then estimate a "difficulty" score from 0.0 to 1.0 representing how hard this specific pattern \
seems to be for THIS learner based on this one answer: 0.0 = clearly mastered/easy for them, \
1.0 = clearly still struggling. Base this on the presence/severity of errors, not on how hard the \
pattern is in the abstract.

Also produce 0-3 short "errorTags" using short kebab-case labels for the KIND of mistake, e.g.: \
"word-order", "case-declension", "verb-conjugation", "preposition-choice", "article-agreement", \
"gender-agreement", "wrong-verb-position", "spelling", "missing-element". Empty array if correct \
with no notable issues.

Write "feedback" as 1-3 sentences, direct and specific, in English, addressed to the learner \
("You..."), explaining what was right/wrong and how to fix it. If correct, briefly affirm why it's \
right (reinforces the rule).

Return ONLY a JSON object of this exact shape, no prose, no markdown fences:
{
  "result": "CORRECT" | "PARTIAL" | "INCORRECT",
  "feedback": string,
  "errorTags": string[],
  "difficulty": number
}
"""


def evaluate_answer(req: EvaluateAnswerRequest) -> EvaluateAnswerResponse:
    user_prompt = f"""Card prompt: {req.card_prompt}
Expected/reference answer: {req.expected_answer}
Grammar pattern being tested: {req.grammar_pattern or "(not specified)"}
Explanation on file for this card: {req.explanation or "(none)"}

Learner's answer: {req.user_answer}

Grade this now. Return the JSON object only."""

    raw = ask_json(SYSTEM_PROMPT, user_prompt, max_tokens=500)
    return EvaluateAnswerResponse(**raw)
