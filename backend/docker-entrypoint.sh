#!/bin/sh
# Container entrypoint: bring the schema up to date, then run CMD (uvicorn).
# Set RUN_MIGRATIONS=false to skip, e.g. for a one-off `docker compose run`.
set -e

if [ "${RUN_MIGRATIONS:-true}" = "true" ]; then
    echo "entrypoint: alembic upgrade head"
    alembic upgrade head
fi

exec "$@"
