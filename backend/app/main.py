from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Annotated

from fastapi import Depends, FastAPI, HTTPException
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import engine, get_session


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    # startup: nothing yet (the scheduler will start here in Phase 2)
    yield
    # shutdown: close every pooled connection
    await engine.dispose()


app = FastAPI(title="Sensor Simulator", lifespan=lifespan)


@app.get("/healthz")
async def healthz(
    session: Annotated[AsyncSession, Depends(get_session)],
) -> dict[str, bool | str]:
    try:
        await session.execute(text("SELECT 1"))
    except Exception as exc:
        raise HTTPException(status_code=503, detail="database unavailable") from exc
    return {"ok": True, "db": "up"}
