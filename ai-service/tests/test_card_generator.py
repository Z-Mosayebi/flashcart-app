"""Unit test for the card generator's JSON parsing path, using a mocked model
response so this runs in CI without a model API key."""

from unittest.mock import patch

from app.services.card_generator import generate_cards_from_notes

MOCK_MODEL_RESPONSE = """[
  {
    "type": "SENTENCE_PRODUCTION",
    "topicName": "weswegen relative clause",
    "topicPattern": "der Grund/die Gründe + , weswegen + subject + ... + verb(end)",
    "prompt": "Using 'weswegen', write a sentence explaining why you are learning German.",
    "answer": "Der Grund, weswegen ich Deutsch lerne, ist die Integration mit den Deutschen.",
    "explanation": "weswegen sends the conjugated verb to the end of the subordinate clause.",
    "hints": ["Verb goes to the very end"],
    "sourceText": "Der Grund, weswegen ich Deutsch lerne, ist die Integration mit den Deutschen."
  }
]"""


@patch("app.services.card_generator.ask_json")
def test_generate_cards_parses_model_output(mock_ask_json):
    import json

    mock_ask_json.return_value = json.loads(MOCK_MODEL_RESPONSE)

    result = generate_cards_from_notes(raw_markdown="...", source_document_title="DW")

    assert len(result.cards) == 1
    card = result.cards[0]
    assert card.type == "SENTENCE_PRODUCTION"
    assert card.topic_name == "weswegen relative clause"
    assert "Integration" in card.answer
