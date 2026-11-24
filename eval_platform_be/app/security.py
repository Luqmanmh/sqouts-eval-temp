"""Passwords and JWT cookies, compatible with what the Django backend wrote.

Passwords: Django stored "bcrypt_sha256$<bcrypt hash of hex(sha256(pw))>"
(PASSWORD_HASHERS listed BCryptSHA256 first, PBKDF2 second). Both formats are
checked here, and new passwords are written as bcrypt_sha256, so Django still
accepts them while the two backends run side by side.

Tokens: the same HS256 JWTs SimpleJWT issued (token_type, exp, iat, jti,
user_id), signed with the same SECRET_KEY, so existing sessions survive the
switch.
"""

import base64
import hashlib
import hmac
import secrets
import uuid
from datetime import datetime, timezone

import bcrypt
import jwt
from fastapi import Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from . import config
from .database import get_db
from .errors import ApiError
from .models import User

# --- passwords ---------------------------------------------------------------


def _sha256_hex(password: str) -> bytes:
    return hashlib.sha256(password.encode()).hexdigest().encode()


def hash_password(password: str) -> str:
    hashed = bcrypt.hashpw(_sha256_hex(password), bcrypt.gensalt(12))
    return "bcrypt_sha256$" + hashed.decode()


def check_password(password: str, encoded: str) -> bool:
    algorithm, _, rest = (encoded or "").partition("$")
    if algorithm == "bcrypt_sha256":
        try:
            return bcrypt.checkpw(_sha256_hex(password), rest.encode())
        except ValueError:
            return False
    if algorithm == "pbkdf2_sha256":
        try:
            iterations, salt, expected = rest.split("$", 2)
            digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), int(iterations))
        except ValueError:
            return False
        return hmac.compare_digest(base64.b64encode(digest).decode(), expected)
    return False  # unusable ("!...") or an unknown hasher


def random_password() -> str:
    return secrets.token_urlsafe(8)


# --- tokens ------------------------------------------------------------------


def _make_token(user: User, token_type: str, lifetime) -> str:
    now = datetime.now(timezone.utc)
    claims = {
        "token_type": token_type,
        "exp": now + lifetime,
        "iat": now,
        "jti": uuid.uuid4().hex,
        "user_id": str(user.id),
    }
    return jwt.encode(claims, config.SECRET_KEY, algorithm="HS256")


def access_token(user: User) -> str:
    return _make_token(user, "access", config.ACCESS_TOKEN_LIFETIME)


def refresh_token(user: User) -> str:
    return _make_token(user, "refresh", config.REFRESH_TOKEN_LIFETIME)


def read_token(token: str, token_type: str) -> int | None:
    """The user id in a valid, unexpired token of this type, else None."""
    try:
        claims = jwt.decode(token, config.SECRET_KEY, algorithms=["HS256"])
    except jwt.PyJWTError:
        return None
    if claims.get("token_type") != token_type:
        return None
    try:
        return int(claims["user_id"])
    except (KeyError, TypeError, ValueError):
        return None


# --- cookies -----------------------------------------------------------------


def set_cookie(response, key: str, value: str, max_age: int) -> None:
    response.set_cookie(
        key=key,
        value=value,
        httponly=True,
        secure=not config.DEBUG,
        samesite="lax",
        max_age=max_age,
        path="/",
    )


ACCESS_MAX_AGE = int(config.ACCESS_TOKEN_LIFETIME.total_seconds())
REFRESH_MAX_AGE = int(config.REFRESH_TOKEN_LIFETIME.total_seconds())


# --- dependencies ------------------------------------------------------------


async def current_user(request: Request, db: AsyncSession = Depends(get_db)) -> User:
    """The logged-in user, from the access_token cookie. 401 otherwise, which is
    what makes the frontend try a refresh."""
    token = request.cookies.get("access_token")
    if not token:
        raise ApiError(401, {"detail": "Authentication credentials were not provided."})
    user_id = read_token(token, "access")
    if user_id is None:
        raise ApiError(401, {"detail": "Given token not valid for any token type"})
    user = await db.get(User, user_id)
    if user is None:
        raise ApiError(401, {"detail": "User not found"})
    if not user.is_active:
        raise ApiError(401, {"detail": "User is inactive"})
    return user


async def admin_user(user: User = Depends(current_user)) -> User:
    if not user.is_staff:
        raise ApiError(403, {"detail": "You do not have permission to perform this action."})
    return user
