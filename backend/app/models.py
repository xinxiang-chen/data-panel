from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, Double, ForeignKey, MetaData, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

# Deterministic constraint names, so later migrations can drop/alter them by name.
NAMING_CONVENTION = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}


class Base(DeclarativeBase):
    metadata = MetaData(naming_convention=NAMING_CONVENTION)


class Device(Base):
    __tablename__ = "devices"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(unique=True)
    display_name: Mapped[str | None]
    description: Mapped[str | None]
    kind: Mapped[str]  # ahu / vav / pv / meter

    # lazy="raise": async sessions can't lazy-load, so force an explicit
    # selectinload(Device.sensors) instead of a confusing MissingGreenlet error.
    sensors: Mapped[list["Sensor"]] = relationship(
        back_populates="device", lazy="raise", order_by="Sensor.name"
    )


class Sensor(Base):
    __tablename__ = "sensors"

    id: Mapped[int] = mapped_column(primary_key=True)
    device_id: Mapped[int] = mapped_column(
        ForeignKey("devices.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(unique=True)
    description: Mapped[str | None]
    unit: Mapped[str | None]
    model_type: Mapped[str]  # which simulator model generates this sensor's values
    params: Mapped[dict[str, Any]] = mapped_column(
        JSONB, server_default=text("'{}'::jsonb")
    )

    device: Mapped[Device] = relationship(back_populates="sensors", lazy="raise")


class Reading(Base):
    """Time-series table; converted to a TimescaleDB hypertable on `ts` in the migration.

    The primary key must include `ts`: each hypertable chunk is its own table, so a
    unique constraint is only enforceable when it contains the partitioning column.
    (sensor_id, ts) also serves the main query: WHERE sensor_id = ? AND ts BETWEEN ...
    """

    __tablename__ = "readings"

    sensor_id: Mapped[int] = mapped_column(
        ForeignKey("sensors.id", ondelete="CASCADE"), primary_key=True
    )
    ts: Mapped[datetime] = mapped_column(DateTime(timezone=True), primary_key=True)
    value: Mapped[float | None] = mapped_column(Double)
    quality: Mapped[str | None]
