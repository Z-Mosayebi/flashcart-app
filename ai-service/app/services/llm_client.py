"""Model-provider abstraction with a JSON-mode helper.

Every prompt in this service asks the model for strict JSON so downstream
Pydantic models can parse it directly. The "call the model and extract JSON"
logic lives here so each service module stays focused on prompt design.

Two providers are supported, selected with LLM_PROVIDER:

  gemini    (default) — Google's free tier. No credit card, ~1500 requests/day.
  anthropic            — Claude. Paid, best German quality.

Adding a third provider means implementing _complete() for it and registering
it in _PROVIDERS; nothing else in the codebase changes.
"""

import json
import os
import re

DEFAULT_PROVIDER = "gemini"

# Sensible per-provider defaults; override with LLM_MODEL.
#
# gemini-flash-lite-latest rather than a pinned gemini-2.0-flash: the pinned
# versioned models are increasingly gated behind a paid tier (they return 429
# with "limit: 0" on free keys), whereas the -latest alias tracks whichever
# flash-lite model the free tier currently serves.
_DEFAULT_MODELS = {
    "gemini": "gemini-flash-lite-latest",
    "anthropic": "claude-haiku-4-5-20251001",
}


def _provider_name() -> str:
    return os.environ.get("LLM_PROVIDER", DEFAULT_PROVIDER).strip().lower()


def _model_name(provider: str) -> str:
    explicit = os.environ.get("LLM_MODEL")
    if explicit:
        return explicit
    # Kept for backwards compatibility with the earlier Anthropic-only setup.
    if provider == "anthropic" and os.environ.get("ANTHROPIC_MODEL"):
        return os.environ["ANTHROPIC_MODEL"]
    return _DEFAULT_MODELS[provider]


# ---------- Gemini ----------


def _complete_gemini(system: str, user: str, max_tokens: int) -> str:
    import httpx

    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise RuntimeError(
            "GEMINI_API_KEY is not set. Get a free key at https://aistudio.google.com/apikey "
            "and add it to ai-service/.env (see .env.example)."
        )

    model = _model_name("gemini")
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"

    payload = {
        "systemInstruction": {"parts": [{"text": system}]},
        "contents": [{"role": "user", "parts": [{"text": user}]}],
        "generationConfig": {
            "maxOutputTokens": max_tokens,
            "temperature": 0.3,  # grading should be consistent, not creative
        },
    }

    resp = httpx.post(
        url,
        json=payload,
        headers={"x-goog-api-key": api_key, "Content-Type": "application/json"},
        timeout=120,
    )

    if resp.status_code == 429:
        # Two very different causes share this status. "limit: 0" means the model
        # isn't available on this key's tier at all, so telling the user to wait
        # would send them in circles; a normal quota hit is genuinely transient.
        body = resp.text
        if "limit: 0" in body:
            raise RuntimeError(
                f"Model {model!r} is not available on your Gemini plan (quota limit is 0). "
                "Try LLM_MODEL=gemini-flash-lite-latest, or check "
                "https://aistudio.google.com/apikey that the key's project has free-tier access."
            )
        raise RuntimeError(
            "Gemini rate limit reached (free tier allows ~15 requests/minute). "
            "Wait a moment and try again."
        )
    resp.raise_for_status()

    data = resp.json()
    candidates = data.get("candidates") or []
    if not candidates:
        # Usually means the prompt tripped a safety filter.
        raise ValueError(f"Gemini returned no candidates: {str(data)[:200]}")

    parts = candidates[0].get("content", {}).get("parts", [])
    return "".join(part.get("text", "") for part in parts)


# ---------- Anthropic ----------


def _complete_anthropic(system: str, user: str, max_tokens: int) -> str:
    from anthropic import Anthropic

    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise RuntimeError(
            "ANTHROPIC_API_KEY is not set. Add it to ai-service/.env (see .env.example)."
        )

    client = Anthropic(api_key=api_key)
    message = client.messages.create(
        model=_model_name("anthropic"),
        max_tokens=max_tokens,
        system=system,
        messages=[{"role": "user", "content": user}],
    )
    return "".join(block.text for block in message.content if block.type == "text")


_PROVIDERS = {
    "gemini": _complete_gemini,
    "anthropic": _complete_anthropic,
}


def _complete(system: str, user: str, max_tokens: int) -> str:
    provider = _provider_name()
    handler = _PROVIDERS.get(provider)
    if handler is None:
        raise RuntimeError(
            f"Unknown LLM_PROVIDER {provider!r}. Supported: {', '.join(sorted(_PROVIDERS))}."
        )
    return handler(system, user, max_tokens)


# ---------- JSON handling ----------


def _extract_json(text: str) -> dict | list:
    """Models sometimes wrap JSON in prose or code fences despite instructions.
    Fall back to pulling out the first {...} or [...] block."""
    text = (text or "").strip()

    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    fence_match = re.search(r"```(?:json)?\s*(.*?)```", text, re.DOTALL)
    if fence_match:
        try:
            return json.loads(fence_match.group(1))
        except json.JSONDecodeError:
            pass

    brace_match = re.search(r"(\{.*\}|\[.*\])", text, re.DOTALL)
    if brace_match:
        return json.loads(brace_match.group(1))

    raise ValueError(f"Could not extract JSON from model response: {text[:200]}")


def ask_json(system: str, user: str, max_tokens: int = 1500) -> dict | list:
    """Send a system+user prompt, expect a JSON object/array back."""
    return _extract_json(_complete(system, user, max_tokens))


def ask_text(system: str, user: str, max_tokens: int = 800) -> str:
    """Send a system+user prompt, return plain text."""
    return _complete(system, user, max_tokens)
