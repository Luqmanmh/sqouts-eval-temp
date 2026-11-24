from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Request, Response
from pydantic import BaseModel
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from .. import security
from ..database import get_db
from ..errors import ApiError
from ..models import User

router = APIRouter(prefix="/auth", tags=["auth"])


class LoginIn(BaseModel):
    username: str = ""  # a username or an email
    password: str = ""
    persists: bool = False


def role(user: User) -> str:
    return "super" if user.is_superuser else "admin" if user.is_staff else "user"


@router.post("/login")
async def login(body: LoginIn, response: Response, db: AsyncSession = Depends(get_db)):
    # Username first, then email, as before.
    users = (await db.scalars(
        select(User).where(or_(User.username == body.username, User.email == body.username))
    )).all()
    user = next((u for u in users if u.username == body.username), users[0] if users else None)

    if user is None:
        raise ApiError(401, {"detail": "User not Found"})
    if not security.check_password(body.password, user.password):
        raise ApiError(401, {"detail": "Incorrect Password!"})
    if not user.is_active:
        raise ApiError(401, {"detail": "This account is currently inactive."})

    user.last_login = datetime.now(timezone.utc)
    await db.commit()

    security.set_cookie(response, "access_token", security.access_token(user), security.ACCESS_MAX_AGE)
    if body.persists:
        security.set_cookie(response, "refresh_token", security.refresh_token(user), security.REFRESH_MAX_AGE)
    return {"username": user.username, "userid": user.id, "role": role(user)}


@router.post("/refresh")
async def refresh(request: Request, response: Response, db: AsyncSession = Depends(get_db)):
    token = request.cookies.get("refresh_token")
    if not token:
        raise ApiError(401, {"detail": "Refresh token cookie is missing."})
    user_id = security.read_token(token, "refresh")
    user = await db.get(User, user_id) if user_id is not None else None
    if user is None or not user.is_active:
        raise ApiError(401, {"detail": "Invalid or expired refresh token."})

    security.set_cookie(response, "access_token", security.access_token(user), security.ACCESS_MAX_AGE)
    return {"detail": "Token refreshed successfully."}


@router.post("/logout")
async def logout(response: Response):
    # No auth needed: an expired cookie shouldn't block logging out. Path and
    # samesite must match how the cookies were set, or the browser keeps them.
    response.delete_cookie("access_token", path="/", samesite="lax")
    response.delete_cookie("refresh_token", path="/", samesite="lax")
    return {"detail": "Logged out."}


@router.get("/me")
async def me(user: User = Depends(security.current_user)):
    """The logged-in profile, so the frontend can refresh its copy on load."""
    return {"username": user.username, "userid": user.id, "role": role(user)}
