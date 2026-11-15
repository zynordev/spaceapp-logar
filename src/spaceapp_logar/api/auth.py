from datetime import datetime, timezone

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status

from spaceapp_logar.auth import (
    User,
    auth_configured,
    auth_required,
    authenticate,
    current_user,
    issue_token,
)
from spaceapp_logar.schemas.auth import AuthConfigRead, MeRead, TokenRead, TokenRequest

# Not protected by current_user: this is where a token is obtained.
router = APIRouter(prefix="/v1/auth", tags=["auth"])


@router.post("/token", response_model=TokenRead)
def create_token(payload: TokenRequest) -> TokenRead:
    """Exchange a demo user's id and passcode for a short-lived bearer token.

    Users come from SPACEAPP_AUTH_USERS; 503 when SPACEAPP_AUTH_SECRET is not
    set, 401 for an unknown id or wrong passcode.
    """

    if not auth_configured():
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Authentication is not configured")
    user = authenticate(payload.user_id, payload.passcode)
    if user is None or user.role is None:
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED,
            "Invalid user id or passcode",
            headers={"WWW-Authenticate": "Bearer"},
        )
    token, expires = issue_token(user.user_id, user.role)
    return TokenRead(
        access_token=token,
        expires_at=datetime.fromtimestamp(expires, tz=timezone.utc),
        role=user.role,
        user_id=user.user_id,
    )


@router.get("/config", response_model=AuthConfigRead)
def read_auth_config() -> AuthConfigRead:
    """Public auth settings so a client knows whether to ask for a login."""

    return AuthConfigRead(auth_required=auth_required(), auth_configured=auth_configured())


@router.get("/me", response_model=MeRead)
def read_me(user: Annotated[User, Depends(current_user)]) -> MeRead:
    """The caller's identity; anonymous demo user when auth is not required."""

    return MeRead(user_id=user.user_id, role=user.role, anonymous=user.anonymous)
