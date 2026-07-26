"""Thin wrapper around the Anthropic SDK with a JSON-mode helper.

All prompts in this service ask Claude to return strict JSON so downstream
Pydantic models can parse it directly. We centralize the "call the model and
extract JSON" logic here so each service module stays focused on prompt design.
"""

import json
import os
import re

from anthropic import Anthropic

_client: Anthropic | None = None

DEFAULT_MODEL = os.environ.get("ANTHROPIC_MODEL", "claude-sonnet-5")


def get_client() -> Anthropic:
    global _client
    if _client is None:
        api_key = os.environ.get("ANTHROPIC_API_KEY")
        if not api_key:
            raise RuntimeError(
                "ANTHROPIC_API_KEY is not set. Add it to ai-service/.env (see .env.example)."
            )
        _client = Anthropic(api_key=api_key)
    return _client


def _extract_json(text: str) -> dict:
    """Claude sometimes wraps JSON in prose or code fences despite instructions.
    Pull out the first {...} or [...] block as a fallback."""
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    fence_match = re.search(r"```(?:json)?\s*(.*?)```", text, re.DOTALL)
    if fence_match:
        return json.loads(fence_match.group(1))

    brace_match = re.search(r"(\{.*\}|\[.*\])", text, re.DOTALL)
    if brace_match:
        return json.loads(brace_match.group(1))

    raise ValueError(f"Could not extract JSON from model response: {text[:200]}")


def ask_json(system: str, user: str, max_tokens: int = 1500) -> dict | list:
    """Send a system+user prompt, expect a JSON object/array back."""
    client = get_client()
    message = client.messages.create(
        model=DEFAULT_MODEL,
        max_tokens=max_tokens,
        system=system,
        messages=[{"role": "user", "content": user}],
    )
    text = "".join(block.text for block in message.content if block.type == "text")
    return _extract_json(text)


def ask_text(system: str, user: str, max_tokens: int = 800) -> str:
    """Send a system+user prompt, return plain text (for chat replies)."""
    client = get_client()
    message = client.messages.create(
        model=DEFAULT_MODEL,
        max_tokens=max_tokens,
        system=system,
        messages=[{"role": "user", "content": user}],
    )
    return "".join(block.text for block in message.content if block.type == "text")
