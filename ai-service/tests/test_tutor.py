"""Tests for the grading and conversational-tutor paths, with the model call
mocked so these run in CI without a model API key.

The serialization assertions matter: web/lib/ai.ts reads `errorTags`, so if the
response ever went out as snake_case `error_tags` the review UI would silently
show no error tags at all.
"""

from unittest.mock import patch

from fastapi.testclient import TestClient

from app.main import app
from app.models.schemas import EvaluateAnswerRequest, TutorChatRequest
from app.services.tutor import evaluate_answer
from app.services.tutor_chat import chat_turn

client = TestClient(app)


@patch("app.services.tutor.ask_json")
def test_evaluate_answer_parses_model_output(mock_ask_json):
    mock_ask_json.return_value = {
        "result": "PARTIAL",
        "feedback": "Word order is off — the verb belongs at the end.",
        "errorTags": ["word-order"],
        "difficulty": 0.7,
    }

    result = evaluate_answer(
        EvaluateAnswerRequest(
            cardPrompt="Bilde einen Satz mit 'weswegen'.",
            expectedAnswer="Der Grund, weswegen ich lerne, ist klar.",
            userAnswer="Der Grund, weswegen ich lerne ist klar",
        )
    )

    assert result.result == "PARTIAL"
    assert result.error_tags == ["word-order"]
    assert result.difficulty == 0.7


@patch("app.services.tutor.ask_json")
def test_evaluate_endpoint_emits_camel_case_error_tags(mock_ask_json, monkeypatch):
    """The HTTP layer must emit errorTags, not error_tags — lib/ai.ts depends on it."""
    mock_ask_json.return_value = {
        "result": "INCORRECT",
        "feedback": "Wrong case after 'mit'.",
        "errorTags": ["case-declension", "preposition"],
        "difficulty": 0.9,
    }

    monkeypatch.setenv("AI_SERVICE_AUTH_TOKEN", "test-service-token")
    res = client.post(
        "/tutor/evaluate",
        headers={"X-AI-Service-Token": "test-service-token"},
        json={
            "cardPrompt": "Ergänze: Ich fahre mit ___ Bus.",
            "expectedAnswer": "dem",
            "userAnswer": "den",
        },
    )

    assert res.status_code == 200
    body = res.json()
    assert body["errorTags"] == ["case-declension", "preposition"]
    assert "error_tags" not in body
    assert body["result"] == "INCORRECT"


@patch("app.services.tutor_chat.ask_json")
def test_chat_turn_returns_reply_and_mastery(mock_ask_json):
    mock_ask_json.return_value = {
        "reply": "Genau! Jetzt versuch denselben Satz im Perfekt.",
        "mastered": False,
    }

    result = chat_turn(
        TutorChatRequest(
            topicName="weswegen relative clause",
            topicPattern="der Grund, weswegen + ... + Verb(end)",
            history=[],
            userMessage="Der Grund, weswegen ich Deutsch lerne, ist meine Arbeit.",
        )
    )

    assert result.mastered is False
    assert "Perfekt" in result.reply


@patch("app.services.tutor_chat.ask_json")
def test_chat_turn_flags_mastery(mock_ask_json):
    mock_ask_json.return_value = {"reply": "Das sitzt jetzt.", "mastered": True}

    result = chat_turn(
        TutorChatRequest(
            topicName="Dativ nach 'mit'",
            history=[],
            userMessage="Ich fahre mit dem Bus zur Arbeit.",
        )
    )

    assert result.mastered is True


@patch("app.services.tutor.ask_json")
def test_out_of_range_difficulty_is_clamped(mock_ask_json):
    """The scheduler expects 0..1; the model does not always comply."""
    base = {"result": "CORRECT", "feedback": "Good.", "errorTags": []}
    req = EvaluateAnswerRequest(cardPrompt="p", expectedAnswer="a", userAnswer="a")

    for raw, expected in [(1.7, 1.0), (-0.3, 0.0), (float("nan"), 0.5)]:
        mock_ask_json.return_value = {**base, "difficulty": raw}
        assert evaluate_answer(req).difficulty == expected


def test_oversized_answer_is_rejected(monkeypatch):
    monkeypatch.setenv("AI_SERVICE_AUTH_TOKEN", "test-service-token")
    res = client.post(
        "/tutor/evaluate",
        headers={"X-AI-Service-Token": "test-service-token"},
        json={"cardPrompt": "p", "expectedAnswer": "a", "userAnswer": "x" * 2_001},
    )
    assert res.status_code == 422


# Must match GRADER_TAGS in web/lib/error-tags.ts: the review screen explains
# exactly these, so a tag outside the list would show no explanation.
GRADER_TAGS = [
    "word-order", "case-declension", "verb-conjugation", "verb-tense", "preposition-choice",
    "article-agreement", "gender-agreement", "wrong-verb-position", "spelling", "vocabulary",
    "punctuation", "capitalization", "adjective-ending", "plural-form", "separable-verb",
    "off-topic", "missing-element",
]


def test_grader_is_limited_to_the_explained_tags():
    from app.services.tutor import ERROR_TAGS, SYSTEM_PROMPT

    assert sorted(ERROR_TAGS) == sorted(GRADER_TAGS)
    for tag in GRADER_TAGS:
        assert f'"{tag}"' in SYSTEM_PROMPT
    assert "ONLY" in SYSTEM_PROMPT.split("errorTags")[1]


def test_gave_up_defaults_to_false():
    from app.models.schemas import EvaluateAnswerResponse

    parsed = EvaluateAnswerResponse(result="CORRECT", feedback="Good.", errorTags=[], difficulty=0.1)
    assert parsed.gave_up is False


@patch("app.services.tutor.ask_json")
def test_evaluate_endpoint_emits_gave_up(mock_ask_json, monkeypatch):
    """An 'I forgot' answer comes back flagged so the app skips the retry."""
    mock_ask_json.return_value = {
        "result": "INCORRECT",
        "feedback": "After 'ein', a neuter adjective takes '-es': ein beliebtes Reiseziel.",
        "errorTags": ["missing-element"],
        "difficulty": 1.0,
        "gaveUp": True,
    }
    monkeypatch.setenv("AI_SERVICE_AUTH_TOKEN", "test-service-token")
    res = client.post(
        "/tutor/evaluate",
        headers={"X-AI-Service-Token": "test-service-token"},
        json={"cardPrompt": "Why -es?", "expectedAnswer": "Because…", "userAnswer": "I forget"},
    )
    assert res.status_code == 200
    assert res.json()["gaveUp"] is True


def test_prompt_teaches_instead_of_critiquing_a_give_up():
    from app.services.tutor import SYSTEM_PROMPT

    assert '"gaveUp"' in SYSTEM_PROMPT
    assert "don't know" in SYSTEM_PROMPT


@patch("app.services.tutor.ask_json")
def test_first_answer_feedback_never_gives_away_the_answer(mock_ask_json):
    """A retry follows a wrong first answer, so the answer must stay hidden."""
    mock_ask_json.return_value = {
        "result": "INCORRECT",
        "feedback": "The correct answer is 'Anbindung'. Remember: 'an + Akkusativ'.",
        "errorTags": ["vocabulary"],
        "difficulty": 0.8,
    }
    req = EvaluateAnswerRequest(
        cardPrompt="Wie ist denn da die ___ an den Flughafen?",
        expectedAnswer="Anbindung",
        userAnswer="Verbindung",
        revealAnswer=False,
    )
    result = evaluate_answer(req)
    assert "anbindung" not in result.feedback.lower()
    assert "an + Akkusativ" in result.feedback


@patch("app.services.tutor.ask_json")
def test_feedback_may_name_the_answer_after_the_retry(mock_ask_json):
    mock_ask_json.return_value = {
        "result": "INCORRECT",
        "feedback": "The correct answer is 'Anbindung'.",
        "errorTags": [],
        "difficulty": 0.8,
    }
    req = EvaluateAnswerRequest(cardPrompt="…", expectedAnswer="Anbindung", userAnswer="x", revealAnswer=True)
    assert "Anbindung" in evaluate_answer(req).feedback


@patch("app.services.tutor.ask_json")
def test_a_give_up_is_taught_with_the_answer(mock_ask_json):
    """'I forget' skips the retry, so teaching with the answer is right."""
    mock_ask_json.return_value = {
        "result": "INCORRECT",
        "feedback": "It is 'Anbindung an + Akkusativ'.",
        "errorTags": [],
        "difficulty": 1.0,
        "gaveUp": True,
    }
    req = EvaluateAnswerRequest(cardPrompt="…", expectedAnswer="Anbindung", userAnswer="I forget", revealAnswer=False)
    assert "Anbindung" in evaluate_answer(req).feedback


def test_prompt_forbids_revealing_before_the_retry():
    from app.services.tutor import SYSTEM_PROMPT

    assert "Reveal answer" in SYSTEM_PROMPT


@patch("app.services.tutor_chat.ask_json")
def test_session_opened_from_a_card_starts_on_that_card(mock_ask_json):
    """From "Practise this with the tutor", the first turn targets the missed card."""
    mock_ask_json.return_value = {"reply": "Lass uns 'Anbindung an + Akk.' üben.", "mastered": False}
    chat_turn(
        TutorChatRequest(
            topicName="Häufige Fehler",
            history=[],
            userMessage="",
            focus={
                "cardPrompt": "Wie ist denn da die ___ an den Flughafen?",
                "expectedAnswer": "Anbindung",
                "learnerAnswer": "Verbindung",
                "feedback": "Wrong noun for 'an + Akkusativ'.",
            },
        )
    )
    prompt = mock_ask_json.call_args[0][1]
    assert "Wie ist denn da die ___ an den Flughafen?" in prompt
    assert "Anbindung" in prompt and "Verbindung" in prompt
    assert "Start with this card" in prompt


@patch("app.services.tutor_chat.ask_json")
def test_session_without_a_card_is_unchanged(mock_ask_json):
    mock_ask_json.return_value = {"reply": "Hallo!", "mastered": False}
    chat_turn(TutorChatRequest(topicName="Dativ", history=[], userMessage=""))
    assert "Start with this card" not in mock_ask_json.call_args[0][1]


def test_tutor_is_told_to_make_the_learner_build_the_sentence():
    """A task that already contains the German answer turns practice into copying."""
    from app.services.tutor_chat import SYSTEM_PROMPT

    p = SYSTEM_PROMPT.lower()
    assert "never write the german sentence" in p
    assert "english sentence to translate" in p or "situation" in p
    assert "hint" in p  # help without giving the answer away
    assert "your own task wording" in p  # don't mark what the task caused
