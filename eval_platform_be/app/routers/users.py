"""The admin user manager. Admins (is_staff) can use it; only a superuser can
grant or remove admin, or touch another admin's account."""

import re
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from .. import security
from ..database import get_db
from ..deletion import delete_user
from ..errors import ApiError, bad_request, not_found
from ..models import User
from ..paging import iso, page_number, paginate

router = APIRouter(prefix="/usermanage", tags=["users"])

USERNAME = re.compile(r"^[\w.@+-]{1,150}$")  # Django's UnicodeUsernameValidator
EMAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def user_row(u: User) -> dict:
    return {
        "id": u.id,
        "username": u.username,
        "email": u.email,
        "is_staff": u.is_staff,
        "is_active": u.is_active,
        "last_login": iso(u.last_login),
    }


async def editable_user(db: AsyncSession, id: int) -> User:
    """A user the manager may act on: never a superuser."""
    user = await db.get(User, id)
    if user is None or user.is_superuser:
        raise not_found("No User matches the given query.")
    return user


@router.get("/list")
async def list_users(
    query: str = "",
    page: str | None = Query(None),
    me: User = Depends(security.admin_user),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(User).where(User.is_superuser.is_(False), User.id != me.id).order_by(User.id)
    if query:
        stmt = stmt.where(or_(User.username.icontains(query), User.email.icontains(query)))
    rows, pagin = await paginate(db, stmt, page_number(page), 50)
    return {"data": [user_row(u) for u in rows], "pagin": pagin}


class NewUser(BaseModel):
    username: str | None = None
    email: str | None = None
    password: str | None = None
    randomize: bool = False


@router.post("/create", status_code=201)
async def create_user(body: NewUser, _: User = Depends(security.admin_user), db: AsyncSession = Depends(get_db)):
    # Errors in the shape the old serializer returned ({field: [message]}),
    # which the user manager page reads.
    username = (body.username or "").strip()
    email = (body.email or "").strip()
    if not username:
        raise ApiError(400, {"username": ["This field is required."]})
    if not USERNAME.match(username):
        raise ApiError(400, {"username": ["Enter a valid username. Letters, digits and @/./+/-/_ only."]})
    if email and not EMAIL.match(email):
        raise ApiError(400, {"email": ["Enter a valid email address."]})
    if email and await db.scalar(select(func.count()).where(User.email == email)):
        raise ApiError(400, {"err": ["Email already in use."]})
    if await db.scalar(select(func.count()).where(User.username == username)):
        raise ApiError(400, {"err": ["Username already in use."]})
    if not body.randomize and not body.password:
        raise ApiError(400, {"err": ["No password provided."]})

    raw = security.random_password() if body.randomize else body.password
    user = User(
        username=username,
        email=email,
        password=security.hash_password(raw),
        is_superuser=False,
        is_staff=False,
        is_active=True,
        first_name="",
        last_name="",
        date_joined=datetime.now(timezone.utc),
    )
    db.add(user)
    await db.commit()
    return {"username": user.username, "email": user.email, "password": raw}


class StatusIn(BaseModel):
    staff: object = None   # checked by hand: must be a real true/false
    active: object = None


@router.put("/singles/{id}")
async def set_status(id: int, body: StatusIn, me: User = Depends(security.admin_user), db: AsyncSession = Depends(get_db)):
    user = await editable_user(db, id)
    if not isinstance(body.staff, bool) or not isinstance(body.active, bool):
        raise bad_request("staff and active must be true/false")
    if body.staff != user.is_staff and not me.is_superuser:
        raise ApiError(403, {"error": "only a superuser can change staff"})
    if user.id == me.id:
        raise bad_request("you can't change your own account")

    user.is_staff = body.staff
    user.is_active = body.active
    await db.commit()
    return {"detail": "User saved successfully"}


@router.delete("/singles/{id}")
async def remove_user(id: int, me: User = Depends(security.admin_user), db: AsyncSession = Depends(get_db)):
    user = await editable_user(db, id)
    if user.id == me.id:
        raise bad_request("you can't delete your own account")
    if user.is_staff and not me.is_superuser:
        raise ApiError(403, {"error": "only a superuser can delete staff"})
    await delete_user(db, user)
    return {"details": "User deleted"}


class PasswordIn(BaseModel):
    randomize: bool = False
    newpass: str | None = None


@router.patch("/singles/{id}")
async def set_password(id: int, body: PasswordIn, me: User = Depends(security.admin_user), db: AsyncSession = Depends(get_db)):
    user = await editable_user(db, id)
    if user.is_staff and not me.is_superuser:
        raise ApiError(403, {"error": "only a superuser can change staff password"})

    if body.randomize:
        new_pass = security.random_password()
    else:
        new_pass = body.newpass or ""
        if not new_pass:
            raise bad_request("no password were provided")

    user.password = security.hash_password(new_pass)
    await db.commit()
    return {"username": user.username, "email": user.email, "password": new_pass}
