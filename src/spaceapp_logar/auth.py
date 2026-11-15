"""Optional authentication and roles (transition flag, no external service).

Configuration (read from the environment on every request, so it can be
changed without code changes and tests can use ``monkeypatch.setenv``):

- ``SPACEAPP_AUTH_REQUIRED`` (default ``false``; ``1``/``true``/``yes`` turn it
  on): when on, every ``/v1`` endpoint except ``POST /v1/auth/token`` needs an
  ``Authorization: Bearer <token>`` header, otherwise 401. When off, requests
  without a token act as an anonymous demo user and are logged; this is how
  the offline dashboard and the demo scenarios work today. A valid token is
  honoured in both modes (so roles apply to it). An invalid or expired token
  is 401 when the flag is on; when it is off it is logged and ignored (the
  request runs as the anonymous demo user), so nothing changes for existing
  clients until the flag is turned on.
- ``SPACEAPP_AUTH_SECRET``: HMAC key used to sign and verify tokens. Without
  it ``POST /v1/auth/token`` answers 503 and no token can be verified.
- ``SPACEAPP_AUTH_USERS``: demo users as ``id:ROLE:passcode`` separated by
  commas, e.g. ``crew-01:ASTRONAUT:<passcode>,medic-01:CREW_MEDICAL_OFFICER:<passcode>``.
  Roles are the :class:`Role` values. Passcodes live only in the environment,
  never in the repository.

Usage::

    curl -X POST /v1/auth/token -d '{"user_id": "medic-01", "passcode": "..."}'
    curl -H "Authorization: Bearer <access_token>" /v1/alerts?mission_id=...

In endpoints, :func:`current_user` is the FastAPI dependency (``main.py`` adds
it to every ``/v1`` router), :func:`acting_crew_member` decides who performs a
crew action (the token's user, or the id stated in the body in demo mode) and
:func:`require_role` restricts an action to roles for authenticated callers
while leaving anonymous demo access open when the flag is off.

Tokens are ``base64url(json payload).base64url(HMAC-SHA256)`` with a 12 hour
expiry; they are short-lived demo credentials, not a production identity
system (no revocation, no refresh, no password hashing at rest).
"""

import base64
import binascii
import hashlib
import hmac
import json
import logging
import os
import time
from dataclasses import dataclass
from enum import StrEnum
from typing import Annotated

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

logger = logging.getLogger("spaceapp_logar.auth")

TOKEN_TTL_SECONDS = 12 * 60 * 60
ANONYMOUS_ID = "demo-anonymous"

# Only documents the bearer scheme in OpenAPI (/docs "Authorize" button); the
# header itself is parsed in current_user so that rules stay in one place.
_bearer_scheme = HTTPBearer(auto_error=False, description="Token from POST /v1/auth/token")


class Role(StrEnum):
    ASTRONAUT = "ASTRONAUT"
    CREW_MEDICAL_OFFICER = "CREW_MEDICAL_OFFICER"
    GROUND = "GROUND"


@dataclass(frozen=True, slots=True)
class User:
    user_id: str
    role: Role | None
    anonymous: bool = False


def auth_required() -> bool:
    return os.getenv("SPACEAPP_AUTH_REQUIRED", "false").strip().lower() in {"1", "true", "yes"}


def _secret() -> bytes | None:
    secret = os.getenv("SPACEAPP_AUTH_SECRET", "")
    return secret.encode("utf-8") if secret else None


def auth_configured() -> bool:
    return _secret() is not None


def configured_users() -> dict[str, tuple[Role, str]]:
    users: dict[str, tuple[Role, str]] = {}
    for entry in os.getenv("SPACEAPP_AUTH_USERS", "").split(","):
        parts = entry.strip().split(":", 2)
        if len(parts) != 3 or not all(parts):
            continue
        user_id, role, passcode = parts
        try:
            users[user_id] = (Role(role), passcode)
        except ValueError:
            logger.warning("ignoring auth user with unknown role", extra={"user_id": user_id})
    return users


def demo_login_enabled() -> bool:
    return os.getenv("SPACEAPP_DEMO_LOGIN", "false").strip().lower() in {"1", "true", "yes"}


# Fixed demo users for the one-click demo login (no passcodes involved).
DEMO_LOGIN_USERS: dict[Role, tuple[str, str]] = {
    Role.ASTRONAUT: ("demo-astronaut", "Astronot (demo)"),
    Role.CREW_MEDICAL_OFFICER: ("demo-medic", "Mürettebat tıbbi sorumlusu (demo)"),
    Role.GROUND: ("demo-ground", "Yer kontrol / uçuş cerrahı (demo)"),
}


def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _unb64(text: str) -> bytes:
    return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))


def _sign(secret: bytes, payload: str) -> str:
    return _b64(hmac.new(secret, payload.encode("ascii"), hashlib.sha256).digest())


def issue_token(user_id: str, role: Role, now: float | None = None) -> tuple[str, int]:
    """Return ``(token, expires_at_unix_seconds)``; 503 if no secret is set."""

    secret = _secret()
    if secret is None:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Authentication is not configured")
    issued = time.time() if now is None else now
    expires = int(issued + TOKEN_TTL_SECONDS)
    payload = _b64(json.dumps({"sub": user_id, "role": role.value, "exp": expires}).encode())
    return f"{payload}.{_sign(secret, payload)}", expires


def verify_token(token: str, now: float | None = None) -> User | None:
    """The token's user, or None if it is malformed, tampered or expired."""

    secret = _secret()
    if secret is None or token.count(".") != 1:
        return None
    payload, signature = token.split(".")
    try:
        # Header values may hold any latin-1 text; non-ASCII is simply invalid.
        if not hmac.compare_digest(signature.encode("ascii"), _sign(secret, payload).encode("ascii")):
            return None
        claims = json.loads(_unb64(payload))
        current = time.time() if now is None else now
        if int(claims["exp"]) < current:
            return None
        return User(user_id=str(claims["sub"]), role=Role(claims["role"]))
    except (ValueError, KeyError, TypeError, binascii.Error):
        return None


def authenticate(user_id: str, passcode: str) -> User | None:
    """Check a passcode against SPACEAPP_AUTH_USERS (constant-time compare)."""

    record = configured_users().get(user_id)
    candidate = passcode.encode("utf-8")
    if record is None:
        # Compare anyway so timing does not reveal which ids exist.
        hmac.compare_digest(candidate, b"x" * len(candidate))
        return None
    role, expected = record
    if not hmac.compare_digest(candidate, expected.encode("utf-8")):
        return None
    return User(user_id=user_id, role=role)


def current_user(
    request: Request,
    _credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer_scheme)] = None,
) -> User:
    """FastAPI dependency: the caller, or an anonymous demo user if allowed."""

    header = request.headers.get("authorization", "")
    required = auth_required()
    if header.lower().startswith("bearer "):
        user = verify_token(header[7:].strip())
        if user is not None:
            return user
        if required:
            raise HTTPException(
                status.HTTP_401_UNAUTHORIZED,
                "Invalid or expired token",
                headers={"WWW-Authenticate": "Bearer"},
            )
        # Flag off: behave exactly as before auth existed (no new 401s).
        logger.warning(
            "invalid or expired token ignored; acting as anonymous demo user",
            extra={"method": request.method, "path": request.url.path},
        )
    elif required:
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED,
            "Authentication required",
            headers={"WWW-Authenticate": "Bearer"},
        )
    else:
        logger.info(
            "anonymous demo access",
            extra={"method": request.method, "path": request.url.path},
        )
    return User(user_id=ANONYMOUS_ID, role=None, anonymous=True)


def acting_crew_member(user: User, claimed: str | None) -> str:
    """Who performs a crew action: the token's user, else the stated id (demo).

    With a token the body's id is ignored, so a caller cannot act in someone
    else's name. Without a token (flag off) the body must name the crew member.
    """

    if not user.anonymous:
        if claimed and claimed != user.user_id:
            logger.info(
                "ignoring crew_member_id that differs from the token user",
                extra={"user_id": user.user_id, "claimed": claimed},
            )
        return user.user_id
    if not claimed:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT,
            "crew_member_id is required when no token is sent",
        )
    return claimed


def require_role(user: User, *roles: Role) -> None:
    """Enforce a role only for authenticated callers (demo mode stays open)."""

    if user.anonymous and not auth_required():
        return
    if user.role not in roles:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            f"Requires role: {', '.join(role.value for role in roles)}",
        )
