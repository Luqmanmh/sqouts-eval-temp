"""Two engines on one set of models: async for the API, sync for the worker.

The worker runs each call in its own thread and its own event loop
(asyncio.run inside a Celery task), so it can't share the API's async pool;
plain sync sessions are the simple, safe choice there.
"""

from collections.abc import AsyncIterator

from sqlalchemy import create_engine
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import sessionmaker

from . import config

engine = create_async_engine(config.DATABASE_URL, pool_pre_ping=True)
AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False)

sync_engine = create_engine(config.SYNC_DATABASE_URL, pool_pre_ping=True)
SyncSessionLocal = sessionmaker(sync_engine, expire_on_commit=False)


async def get_db() -> AsyncIterator[AsyncSession]:
    async with AsyncSessionLocal() as session:
        yield session
