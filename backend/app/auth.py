"""Request guards for the IoT-compatible API, used as router-level dependencies.

The frontend proxy (lib/server/iot.ts) sends the token both as
`Authorization: Bearer <token>` and `x-api-token: <token>`; either one is accepted.
"""

import secrets
from typing import Annotated

from fastapi import Depends, HTTPException, Path, Security, status
from fastapi.security import APIKeyHeader, HTTPAuthorizationCredentials, HTTPBearer

from app.config import Settings, get_settings

SettingsDep = Annotated[Settings, Depends(get_settings)]

# Declaring these as security schemes (instead of plain Header params) makes
# Swagger UI at /docs show an "Authorize" button. auto_error=False lets us
# accept either header and return our own 401 when both are missing/wrong.
bearer_scheme = HTTPBearer(
    auto_error=False, description="Authorization: Bearer <API_TOKEN>"
)
api_key_scheme = APIKeyHeader(
    name="x-api-token", auto_error=False, description="x-api-token: <API_TOKEN>"
)


def _token_matches(candidate: str | None, expected: str) -> bool:
    if not candidate:
        return False
    # Constant-time comparison: timing doesn't reveal how many leading chars matched.
    # Compare bytes so non-ASCII input can't raise TypeError.
    return secrets.compare_digest(candidate.strip().encode(), expected.encode())


async def verify_token(
    settings: SettingsDep,
    bearer: Annotated[HTTPAuthorizationCredentials | None, Security(bearer_scheme)],
    api_key: Annotated[str | None, Security(api_key_scheme)],
) -> None:
    expected = settings.api_token
    bearer_token = bearer.credentials if bearer else None
    if _token_matches(bearer_token, expected) or _token_matches(api_key, expected):
        return
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or missing API token",
        headers={"WWW-Authenticate": "Bearer"},
    )


async def verify_project(
    settings: SettingsDep,
    project_id: Annotated[str, Path(description="Project id, e.g. 'demo'")],
) -> None:
    if project_id != settings.project_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Unknown project '{project_id}'",
        )
