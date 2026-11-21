"""Domain errors raised by the service layer.

Services never raise HTTPException; they raise these instead. The API layer
maps them to HTTP responses (see the exception handler in app/main.py), and
other callers such as the chat agent can catch them directly.
"""


class NotFoundError(Exception):
    """A requested resource does not exist."""


class DeviceNotFound(NotFoundError):
    """No device with the given name."""


class SensorNotFound(NotFoundError):
    """No sensor with the given name (or it does not belong to the device)."""


class InvalidTimeRange(ValueError):
    """Query time range is invalid: naive datetime, start >= end, or span too long."""
