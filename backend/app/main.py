import asyncio
import contextlib
from collections.abc import AsyncIterator
from typing import Annotated, Any

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.iot import router as iot_router
from app.config import get_settings
from app.db import SessionLocal, engine, get_session
from app.errors import (
    DeviceNotFound,
    InvalidInterval,
    InvalidTimeRange,
    SensorNotFound,
)
from app.schemas import ErrorBody
from app.simulator import worker


@contextlib.asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    settings = get_settings()
    # startup: launch the live simulator in the background (same event loop).
    task: asyncio.Task[None] | None = None
    if settings.sim_enabled:
        task = asyncio.create_task(
            worker.run_forever(
                SessionLocal, settings.sim_interval_s, settings.sim_max_catch_up_days
            ),
            name="simulator-worker",
        )
    yield
    # shutdown: stop the worker, then close every pooled connection.
    if task is not None:
        task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await task
    await engine.dispose()


app = FastAPI(title="Sensor Simulator", lifespan=lifespan)
app.include_router(iot_router)


# Map service-layer errors to HTTP. The body is top-level {"errorCode": ...}
# (not wrapped in "detail") because the frontend reads body.errorCode.
@app.exception_handler(DeviceNotFound)
async def device_not_found_handler(
    request: Request, exc: DeviceNotFound
) -> JSONResponse:
    body = ErrorBody(error_code="DeviceNotFound", message=f"Device '{exc}' not found")
    return JSONResponse(status_code=404, content=body.model_dump(mode="json"))


@app.exception_handler(SensorNotFound)
async def sensor_not_found_handler(
    request: Request, exc: SensorNotFound
) -> JSONResponse:
    # "TableNotFound" is the original API's code; the frontend's
    # mapUpstreamErrorToStatus matches this exact string.
    body = ErrorBody(error_code="TableNotFound", message=f"Sensor '{exc}' not found")
    return JSONResponse(status_code=404, content=body.model_dump(mode="json"))


@app.exception_handler(InvalidTimeRange)
async def invalid_time_range_handler(
    request: Request, exc: InvalidTimeRange
) -> JSONResponse:
    body = ErrorBody(error_code="InvalidTimeRange", message=str(exc))
    return JSONResponse(status_code=400, content=body.model_dump(mode="json"))


@app.exception_handler(InvalidInterval)
async def invalid_interval_handler(
    request: Request, exc: InvalidInterval
) -> JSONResponse:
    body = ErrorBody(error_code="InvalidInterval", message=str(exc))
    return JSONResponse(status_code=400, content=body.model_dump(mode="json"))


@app.get("/healthz")
async def healthz(
    session: Annotated[AsyncSession, Depends(get_session)],
) -> dict[str, Any]:
    try:
        await session.execute(text("SELECT 1"))
    except Exception as exc:
        raise HTTPException(status_code=503, detail="database unavailable") from exc
    s = worker.status
    return {
        "ok": True,
        "db": "up",
        "simulator": {
            "enabled": s.enabled,
            "intervalS": s.interval_s,
            "ticks": s.ticks,
            "lastTickAt": s.last_tick_at.isoformat() if s.last_tick_at else None,
            "lastRows": s.last_rows,
            "lastSkipped": s.last_skipped,
            "lastError": s.last_error,
        },
    }
