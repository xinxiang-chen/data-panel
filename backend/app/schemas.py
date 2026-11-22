"""Response models for the IoT-compatible API.

Field names and shapes mirror the frontend's `types/iot.ts` (and the original
building IoT API): camelCase JSON, nested `attributes.{displayName,description}.text`,
and raw values serialized as strings.
"""

from datetime import datetime
from typing import Annotated, Self

from pydantic import BaseModel, BeforeValidator, ConfigDict
from pydantic.alias_generators import to_camel


def _to_numeric_string(v: object) -> object:
    """The original API returns readings as strings ("48.93125"); keep that contract.

    str(float) gives the shortest round-trip form (57.41 -> "57.41"); None stays None.
    """
    if isinstance(v, bool):  # bool is a subclass of int; never a valid reading
        # Pydantic only wraps ValueError/AssertionError into a ValidationError;
        # a TypeError would escape as a raw exception, so TRY004 doesn't apply.
        raise ValueError("boolean is not a numeric reading")  # noqa: TRY004
    if isinstance(v, int | float):
        return str(v)
    return v


NumericString = Annotated[str | None, BeforeValidator(_to_numeric_string)]


class CamelModel(BaseModel):
    """snake_case in Python, camelCase in JSON (e.g. latest_value <-> latestValue)."""

    model_config = ConfigDict(
        alias_generator=to_camel,
        validate_by_name=True,  # construct with snake_case names in Python
        validate_by_alias=True,  # ...or with camelCase keys
        serialize_by_alias=True,  # model_dump() emits camelCase even outside FastAPI
    )


class TextValue(CamelModel):
    text: str | None = None


class Attributes(CamelModel):
    display_name: TextValue | None = None
    description: TextValue | None = None

    @classmethod
    def of(
        cls, display_name: str | None = None, description: str | None = None
    ) -> Self:
        """Attributes.of(description="...") -> {"description": {"text": "..."}}."""
        return cls(
            display_name=TextValue(text=display_name)
            if display_name is not None
            else None,
            description=TextValue(text=description)
            if description is not None
            else None,
        )


class IoTSensor(CamelModel):
    name: str
    attributes: Attributes | None = None
    latest_value: NumericString = None
    latest_timestamp: datetime | None = None
    latest_quality: str | None = None
    latest_query_timestamp: datetime | None = None


class IoTDevice(CamelModel):
    name: str
    attributes: Attributes | None = None
    # Embedded by GET /devices; the frontend's Latest Data page flattens these.
    sensors: list[IoTSensor] | None = None


class IoTRawPoint(CamelModel):
    value: NumericString = None
    quality: str | None = None
    timestamp: datetime


class IoTRollupPoint(CamelModel):
    start_time: datetime
    end_time: datetime
    min: float | None = None
    max: float | None = None
    avg: float | None = None
    sum: float | None = None
    count: int = 0  # number of non-null readings in the bucket


class ErrorBody(CamelModel):
    """Top-level error shape the frontend reads (body.errorCode), e.g. TableNotFound."""

    error_code: str
    message: str | None = None
