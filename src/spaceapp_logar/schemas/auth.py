from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from spaceapp_logar.auth import Role
from spaceapp_logar.schemas.observations import Identifier


class TokenRequest(BaseModel):
    """Demo user credentials configured in SPACEAPP_AUTH_USERS."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    user_id: Identifier
    passcode: str = Field(min_length=1, max_length=200)


class TokenRead(BaseModel):
    access_token: str
    token_type: Literal["bearer"] = "bearer"
    expires_at: datetime
    role: Role
    user_id: str
