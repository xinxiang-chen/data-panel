"""Safety checks for destructive scripts (no DB connection, easy to test).

`seed --reset` TRUNCATEs every table in whatever DATABASE_URL points at. A
shell that still has the production URL exported would wipe the live demo
without a prompt, so anything that isn't clearly this machine needs --yes.
"""

from sqlalchemy.engine import make_url

# A missing host means a local Unix socket.
LOCAL_HOSTS = {None, "", "localhost", "127.0.0.1", "::1"}


def describe_target(database_url: str) -> str:
    """host:port/dbname without credentials, for printing."""
    url = make_url(database_url)
    host = url.host or "local socket"
    port = f":{url.port}" if url.port else ""
    return f"{host}{port}/{url.database or ''}"


def is_local_database(database_url: str) -> bool:
    return make_url(database_url).host in LOCAL_HOSTS


def reset_refusal(database_url: str, confirmed: bool) -> str | None:
    """Why `--reset` must not run, or None if it may.

    Local databases reset freely. Anything else (a managed DB, or "db" inside
    docker compose on the server) needs an explicit --yes.
    """
    if confirmed or is_local_database(database_url):
        return None
    return (
        f"Refusing to reset {describe_target(database_url)}: it is not a local "
        "database.\nThis would delete ALL devices, sensors and readings there. "
        "If that is really what you want, re-run with --reset --yes."
    )
