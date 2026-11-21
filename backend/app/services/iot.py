"""Query layer for the IoT-compatible API.

All SQL lives here. Functions take an AsyncSession and return API schema objects,
so they can be reused outside HTTP routes (e.g. by the Phase 3 chat agent's tools).
"""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.errors import DeviceNotFound
from app.models import Device, Sensor
from app.schemas import Attributes, IoTDevice, IoTSensor


def _device_to_schema(device: Device) -> IoTDevice:
    return IoTDevice(
        name=device.name,
        attributes=Attributes.of(
            display_name=device.display_name, description=device.description
        ),
    )


def _sensor_to_schema(sensor: Sensor) -> IoTSensor:
    # latest_* fields are filled in step 6.7.
    return IoTSensor(
        name=sensor.name,
        attributes=Attributes.of(description=sensor.description),
    )


async def list_devices(session: AsyncSession) -> list[IoTDevice]:
    """All devices, ordered by name.

    First version: name + attributes only. Step 6.7 embeds each device's sensors
    and their latest readings (needed by the frontend's Latest Data page).
    """
    devices = await session.scalars(select(Device).order_by(Device.name))
    return [_device_to_schema(d) for d in devices]


async def list_device_sensors(
    session: AsyncSession, device_name: str
) -> list[IoTSensor]:
    """Sensors of one device, ordered by name.

    Two queries on purpose: a JOIN returning [] couldn't tell "unknown device"
    (-> DeviceNotFound / 404) apart from "device with no sensors" (-> []).
    """
    # Look up the device first. scalar() -> one object or None.
    device = await session.scalar(select(Device).where(Device.name == device_name))
    if device is None:
        raise DeviceNotFound(device_name)

    # Then its sensors. scalars() -> iterable of all rows.
    sensors = await session.scalars(
        select(Sensor).where(Sensor.device_id == device.id).order_by(Sensor.name)
    )
    return [_sensor_to_schema(s) for s in sensors]
