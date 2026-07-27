"""Tests for the provider abstraction and JSON extraction.

The JSON-extraction tests matter because models routinely wrap JSON in prose or
markdown fences despite being told not to; if extraction regressed, every grade
and every generated card would fail at once.
"""

import json
from unittest.mock import patch

import pytest

from app.services import llm_client
from app.services.llm_client import _extract_json, ask_json


def test_extracts_plain_json():
    assert _extract_json('{"result": "CORRECT"}') == {"result": "CORRECT"}


def test_extracts_json_from_markdown_fence():
    raw = 'Here you go:\n```json\n{"result": "PARTIAL"}\n```'
    assert _extract_json(raw) == {"result": "PARTIAL"}


def test_extracts_json_from_surrounding_prose():
    raw = 'Sure! {"result": "INCORRECT", "difficulty": 0.8} Hope that helps.'
    assert _extract_json(raw)["result"] == "INCORRECT"


def test_extracts_json_array():
    raw = '```\n[{"type": "VOCAB"}]\n```'
    assert _extract_json(raw) == [{"type": "VOCAB"}]


def test_raises_on_unparseable_response():
    with pytest.raises(ValueError):
        _extract_json("I'm sorry, I can't help with that.")


def test_defaults_to_gemini(monkeypatch):
    monkeypatch.delenv("LLM_PROVIDER", raising=False)
    assert llm_client._provider_name() == "gemini"


def test_unknown_provider_is_rejected(monkeypatch):
    monkeypatch.setenv("LLM_PROVIDER", "not-a-provider")
    with pytest.raises(RuntimeError, match="Unknown LLM_PROVIDER"):
        llm_client._complete("sys", "user", 100)


def test_missing_gemini_key_gives_actionable_error(monkeypatch):
    monkeypatch.setenv("LLM_PROVIDER", "gemini")
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    with pytest.raises(RuntimeError, match="aistudio.google.com"):
        llm_client._complete("sys", "user", 100)


def test_gemini_response_is_parsed(monkeypatch):
    """Covers the real Gemini response shape: candidates -> content -> parts."""
    monkeypatch.setenv("LLM_PROVIDER", "gemini")
    monkeypatch.setenv("GEMINI_API_KEY", "test-key")

    class FakeResponse:
        status_code = 200

        def raise_for_status(self):
            pass

        def json(self):
            return {
                "candidates": [
                    {"content": {"parts": [{"text": '{"result": "CORRECT"}'}]}}
                ]
            }

    with patch("httpx.post", return_value=FakeResponse()):
        assert ask_json("sys", "user") == {"result": "CORRECT"}


class _Response429:
    status_code = 429

    def __init__(self, text: str):
        self.text = text

    def raise_for_status(self):
        raise AssertionError("should short-circuit before raise_for_status")

    def json(self):
        return {}


def test_gemini_transient_rate_limit_is_explained(monkeypatch):
    monkeypatch.setenv("LLM_PROVIDER", "gemini")
    monkeypatch.setenv("GEMINI_API_KEY", "test-key")

    body = '{"error": {"message": "Resource exhausted, limit: 15"}}'
    with patch("httpx.post", return_value=_Response429(body)):
        with pytest.raises(RuntimeError, match="rate limit"):
            ask_json("sys", "user")


def test_gemini_zero_quota_is_distinguished_from_rate_limit(monkeypatch):
    """A 429 with "limit: 0" means the model isn't on this key's tier at all.
    Telling the user to "wait and retry" there would send them in circles."""
    monkeypatch.setenv("LLM_PROVIDER", "gemini")
    monkeypatch.setenv("GEMINI_API_KEY", "test-key")

    body = '{"error": {"message": "Quota exceeded ... limit: 0, model: gemini-2.0-flash"}}'
    with patch("httpx.post", return_value=_Response429(body)):
        with pytest.raises(RuntimeError, match="not available on your Gemini plan"):
            ask_json("sys", "user")
