"""
Conversational tutoring loop, distinct from single-card grading (tutor.py).

Here the AI drives a short back-and-forth on one grammar topic: it asks the
learner to produce sentences, reacts to mistakes, adjusts the next question's
difficulty, and eventually signals "mastered": true once it's confident the
learner can reliably produce the pattern — this is the "ask question, give
feedback, repeat until sure the user has learned it" loop from the brief.
"""

from app.models.schemas import ChatMessage, TutorChatRequest, TutorChatResponse
from app.services.claude_client import ask_json

SYSTEM_PROMPT = """You are a conversational German tutor running a focused practice session on \
ONE grammar topic with a learner. Your job across the whole conversation:

1. Ask the learner to produce a German sentence using the target pattern (vary the scenario each \
   time so they're not just repeating the same sentence).
2. When they respond, grade it honestly, explain any mistake briefly and clearly, and give the \
   corrected form if needed.
3. Ask a new, slightly different prompt to test the pattern again — increase difficulty (longer \
   sentences, less scaffolding, trickier vocabulary) as they get things right, ease off if they're \
   struggling.
4. Only set "mastered": true once the learner has produced the pattern correctly, unprompted, \
   at least 2-3 times in a row without you having to correct core grammar mistakes. Do not declare \
   mastery prematurely.

Keep each reply short (2-5 sentences) and conversational, like a real tutor, not a lecture. Always \
end your reply with either feedback+next question, or a "mastered" wrap-up if you're setting \
mastered=true.

Return ONLY a JSON object of this exact shape, no prose, no markdown fences:
{
  "reply": string,
  "mastered": boolean
}
"""


def chat_turn(req: TutorChatRequest) -> TutorChatResponse:
    history_text = "\n".join(f"{m.role}: {m.content}" for m in req.history)

    user_prompt = f"""Topic: {req.topic_name}
Pattern/formula: {req.topic_pattern or "(not specified — use general knowledge of this topic)"}

Conversation so far:
{history_text or "(this is the first message — greet briefly and give the first prompt)"}

Learner's latest message: {req.user_message}

Continue the tutoring session now. Return the JSON object only."""

    raw = ask_json(SYSTEM_PROMPT, user_prompt, max_tokens=600)
    return TutorChatResponse(**raw)
