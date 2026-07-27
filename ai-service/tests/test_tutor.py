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
def test_evaluate_endpoint_emits_camel_case_error_tags(mock_ask_json):
    """The HTTP layer must emit errorTags, not error_tags — lib/ai.ts depends on it."""
    mock_ask_json.return_value = {
        "result": "INCORRECT",
        "feedback": "Wrong case after 'mit'.",
        "errorTags": ["case-declension", "preposition"],
        "difficulty": 0.9,
    }

    res = client.post(
        "/tutor/evaluate",
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
