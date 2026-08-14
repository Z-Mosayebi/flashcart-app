"""Authentication helpers for internal AI-service callers."""

import os
import secrets

from fastapi import Header, HTTPException, status


def require_service_token(
    x_ai_service_token: str | None = Header(default=None),
) -> None:
    """Require the shared secret used by trusted server-side callers.

    CORS only governs browsers and cannot protect an internet-facing API, so
    model endpoints use a server-to-server secret and fail closed if it is
    missing from the deployment configuration.
    """
    expected = os.getenv("AI_SERVICE_AUTH_TOKEN")
    if not expected or not x_ai_service_token or not secrets.compare_digest(
        x_ai_service_token, expected
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Unauthorized AI service request",
        )
