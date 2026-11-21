"""Routes compatible with the original building IoT API.

Paths mirror what the frontend proxy (lib/server/iot.ts) calls:
    {BASE_URL}/api/{PROJECT_ID}/devices
    {BASE_URL}/api/{PROJECT_ID}/devices/{deviceId}/sensors
    {BASE_URL}/api/{PROJECT_ID}/devices/{deviceId}/sensors/{sensorId}/data
    {BASE_URL}/api/{PROJECT_ID}/devices/{deviceId}/sensors/{sensorId}/rollups

Routes stay thin: parse params -> call app.services.iot -> return schemas.
"""

from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import verify_project, verify_token
from app.db import get_session
from app.schemas import ErrorBody, IoTDevice, IoTSensor
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
    summary="List devices",
)
async def get_devices(session: SessionDep) -> list[IoTDevice]:
    return await iot_service.list_devices(session)


@router.get(
    "/devices/{device_id}/sensors",
    response_model=list[IoTSensor],
    responses={404: {"model": ErrorBody, "description": "Device not found"}},
    summary="List a device's sensors",
)
async def get_device_sensors(device_id: str, session: SessionDep) -> list[IoTSensor]:
    # device_id is the device *name* (e.g. DH_AHU1), matching the original API's paths.
    return await iot_service.list_device_sensors(session, device_id)
