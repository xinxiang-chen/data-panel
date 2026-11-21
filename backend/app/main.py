from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Annotated

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.iot import router as iot_router
from app.db import engine, get_session
from app.errors import DeviceNotFound, InvalidTimeRange, SensorNotFound
from app.schemas import ErrorBody


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    # startup: nothing yet (the scheduler will start here in Phase 2)
    yield
    # shutdown: close every pooled connection
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


@app.get("/healthz")
async def healthz(
    session: Annotated[AsyncSession, Depends(get_session)],
) -> dict[str, bool | str]:
    try:
        await session.execute(text("SELECT 1"))
    except Exception as exc:
        raise HTTPException(status_code=503, detail="database unavailable") from exc
    return {"ok": True, "db": "up"}
