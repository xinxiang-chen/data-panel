"""Routes compatible with the original building IoT API.

Paths mirror what the frontend proxy (lib/server/iot.ts) calls:
    {BASE_URL}/api/{PROJECT_ID}/devices
    {BASE_URL}/api/{PROJECT_ID}/devices/{deviceId}/sensors
    {BASE_URL}/api/{PROJECT_ID}/devices/{deviceId}/sensors/{sensorId}/data
    {BASE_URL}/api/{PROJECT_ID}/devices/{deviceId}/sensors/{sensorId}/rollups

Routes stay thin: parse params -> call app.services.iot -> return schemas.
"""

from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import verify_project, verify_token
from app.db import get_session
from app.schemas import (
    ErrorBody,
    IoTDevice,
    IoTRawPoint,
    IoTRollupPoint,
    IoTSensor,
)
from app.services import iot as iot_service

SessionDep = Annotated[AsyncSession, Depends(get_session)]

# Every route under this router requires a valid token and the configured project id.
router = APIRouter(
    prefix="/api/{project_id}",
    tags=["iot"],
    dependencies=[Depends(verify_token), Depends(verify_project)],
)


@router.get(
    "/devices",
    response_model=list[IoTDevice],
    summary="List devices with their sensors and latest readings",
)
async def get_devices(session: SessionDep) -> list[IoTDevice]:
    return await iot_service.list_devices(session)


@router.get(
    "/devices/{device_id}/sensors",
    response_model=list[IoTSensor],
    responses={404: {"model": ErrorBody, "description": "Device not found"}},
    summary="List a device's sensors with their latest readings",
)
async def get_device_sensors(device_id: str, session: SessionDep) -> list[IoTSensor]:
    # device_id is the device *name* (e.g. DH_AHU1), matching the original API's paths.
    return await iot_service.list_device_sensors(session, device_id)


# camelCase query params (as the frontend sends them) -> snake_case Python names.
StartDate = Annotated[
    datetime,
    Query(alias="startDate", description="ISO 8601 with time zone, e.g. ...Z"),
]
EndDate = Annotated[
    datetime,
    Query(alias="endDate", description="ISO 8601 with time zone, e.g. ...Z"),
]


@router.get(
    "/devices/{device_id}/sensors/{sensor_id}/data",
    response_model=list[IoTRawPoint],
    responses={
        400: {"model": ErrorBody, "description": "Invalid time range"},
        404: {"model": ErrorBody, "description": "Sensor not found (TableNotFound)"},
    },
    summary="Raw readings in a time range",
)
async def get_sensor_data(
    device_id: str,
    sensor_id: str,
    start_date: StartDate,
    end_date: EndDate,
    session: SessionDep,
) -> list[IoTRawPoint]:
    return await iot_service.get_raw_points(
        session, device_id, sensor_id, start_date, end_date
    )


@router.get(
    "/devices/{device_id}/sensors/{sensor_id}/rollups",
    response_model=list[IoTRollupPoint],
    responses={
        400: {"model": ErrorBody, "description": "Invalid interval or time range"},
        404: {"model": ErrorBody, "description": "Sensor not found (TableNotFound)"},
    },
    summary="Aggregated readings (min/max/avg/sum/count) per time bucket",
)
async def get_sensor_rollups(
    device_id: str,
    sensor_id: str,
    start_date: StartDate,
    end_date: EndDate,
    session: SessionDep,
    # Kept as str: the service layer is the single source of truth for allowed
    # values, since the chat agent will call it without going through this route.
    interval: Annotated[
        str, Query(description="Bucket size: 1h 2h 3h 4h 6h 8h 12h 24h")
    ] = "1h",
    strict_filter_to_dates: Annotated[
        bool,
        Query(
            alias="strictFilterToDates",
            description="true: only readings in [start, end] (edge buckets may be "
            "partial). false: widen start to its bucket boundary.",
        ),
    ] = True,
) -> list[IoTRollupPoint]:
    return await iot_service.get_rollup_points(
        session,
        device_id,
        sensor_id,
        interval,
        start_date,
        end_date,
        strict=strict_filter_to_dates,
    )
