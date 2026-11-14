from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, status

from spaceapp_logar.auth import auth_configured, authenticate, issue_token
from spaceapp_logar.schemas.auth import TokenRead, TokenRequest

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
