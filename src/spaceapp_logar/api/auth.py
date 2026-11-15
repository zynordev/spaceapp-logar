from datetime import datetime, timezone

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status

from spaceapp_logar.auth import (
    User,
    auth_configured,
    auth_required,
    DEMO_LOGIN_USERS,
    authenticate,
    current_user,
    demo_login_enabled,
    issue_token,
)
from spaceapp_logar.schemas.auth import (
    AuthConfigRead,
    DemoLoginRequest,
    DemoRoleRead,
    MeRead,
    TokenRead,
    TokenRequest,
)

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


@router.get("/demo-roles", response_model=list[DemoRoleRead])
def list_demo_roles() -> list[DemoRoleRead]:
    """Roles offered by the one-click demo login; empty unless SPACEAPP_DEMO_LOGIN is on."""

    if not demo_login_enabled():
        return []
    return [
        DemoRoleRead(role=role, user_id=user_id, label_tr=label)
        for role, (user_id, label) in DEMO_LOGIN_USERS.items()
    ]


@router.post("/demo-login", response_model=TokenRead)
def demo_login(payload: DemoLoginRequest) -> TokenRead:
    """Signed token for a fixed demo user of the chosen role (no passcode).

    404 unless SPACEAPP_DEMO_LOGIN is on; 503 without SPACEAPP_AUTH_SECRET.
    """

    if not demo_login_enabled():
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Demo login is not enabled")
    if not auth_configured():
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Authentication is not configured")
    user_id, _label = DEMO_LOGIN_USERS[payload.role]
    token, expires = issue_token(user_id, payload.role)
    return TokenRead(
        access_token=token,
        expires_at=datetime.fromtimestamp(expires, tz=timezone.utc),
        role=payload.role,
        user_id=user_id,
    )


@router.get("/config", response_model=AuthConfigRead)
def read_auth_config() -> AuthConfigRead:
    """Public auth settings so a client knows whether to ask for a login."""

    return AuthConfigRead(auth_required=auth_required(), auth_configured=auth_configured())


@router.get("/me", response_model=MeRead)
def read_me(user: Annotated[User, Depends(current_user)]) -> MeRead:
    """The caller's identity; anonymous demo user when auth is not required."""

    return MeRead(user_id=user.user_id, role=user.role, anonymous=user.anonymous)
