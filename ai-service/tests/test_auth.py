from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)


def test_model_endpoints_require_a_service_token(monkeypatch):
    monkeypatch.setenv("AI_SERVICE_AUTH_TOKEN", "test-service-token")

    res = client.post(
        "/tutor/evaluate",
        json={
            "cardPrompt": "Test",
            "expectedAnswer": "Test",
            "userAnswer": "Test",
        },
    )

    assert res.status_code == 401


def test_model_endpoints_reject_an_incorrect_service_token(monkeypatch):
    monkeypatch.setenv("AI_SERVICE_AUTH_TOKEN", "test-service-token")

    res = client.post(
        "/generate/cards",
        headers={"X-AI-Service-Token": "wrong-token"},
        json={"rawMarkdown": "Test", "sourceDocumentTitle": "Test"},
    )

    assert res.status_code == 401
