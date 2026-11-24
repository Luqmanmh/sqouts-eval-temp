"""Create an account from the terminal; replaces Django's createsuperuser.

    python -m app.create_user --superuser
    python -m app.create_user --admin --username ana --email ana@example.com

Asks for anything not given, and for the password without echoing it.
"""

import argparse
import getpass
import sys
from datetime import datetime, timezone

from sqlalchemy import select

from .database import SyncSessionLocal
from .models import User
from .security import hash_password


def main() -> None:
    parser = argparse.ArgumentParser(description="Create a user.")
    parser.add_argument("--username")
    parser.add_argument("--email")
    role = parser.add_mutually_exclusive_group()
    role.add_argument("--superuser", action="store_true", help="can do everything, including granting admin")
    role.add_argument("--admin", action="store_true", help="can manage users (is_staff)")
    opts = parser.parse_args()

    username = opts.username or input("Username: ").strip()
    email = opts.email if opts.email is not None else input("Email (optional): ").strip()
    password = getpass.getpass("Password: ")
    if not username or not password:
        sys.exit("username and password are required")
    if password != getpass.getpass("Password (again): "):
        sys.exit("passwords don't match")

    with SyncSessionLocal() as db:
        if db.scalar(select(User.id).where(User.username == username)):
            sys.exit(f"username {username!r} is already taken")
        db.add(User(
            username=username,
            email=email,
            password=hash_password(password),
            is_superuser=opts.superuser,
            is_staff=opts.superuser or opts.admin,
            is_active=True,
            first_name="",
            last_name="",
            date_joined=datetime.now(timezone.utc),
        ))
        db.commit()
    kind = "superuser" if opts.superuser else "admin" if opts.admin else "user"
    print(f"created {kind} {username}")


if __name__ == "__main__":
    main()
