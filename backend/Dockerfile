# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# Build stage: install locked dependencies into /app/.venv with uv.
# ---------------------------------------------------------------------------
FROM python:3.12-slim AS builder

COPY --from=ghcr.io/astral-sh/uv:0.12.13 /uv /bin/uv

# Precompile .pyc for faster startup; copy (not hardlink) out of the cache
# mount; never download a Python, use the image's.
ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=never

WORKDIR /app

# Dependencies first: this layer is reused until pyproject.toml/uv.lock change.
COPY pyproject.toml uv.lock ./
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --locked --no-dev --no-install-project

# Then the application code (filtered by .dockerignore).
COPY . .
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --locked --no-dev

# ---------------------------------------------------------------------------
# Runtime stage: same Python, no uv or build cache, unprivileged user.
# ---------------------------------------------------------------------------
FROM python:3.12-slim

RUN useradd --create-home --uid 10001 app

WORKDIR /app
COPY --from=builder --chown=app:app /app /app

ENV PATH="/app/.venv/bin:$PATH" \
    PYTHONUNBUFFERED=1

USER app
EXPOSE 8000

# /healthz also checks the database, so "healthy" means ready to serve.
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD ["python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/healthz', timeout=4)"]

# Entrypoint runs migrations, then execs CMD. One process: the advisory lock
# would make extra workers safe, but a small VM doesn't need them.
ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", \
     "--proxy-headers", "--forwarded-allow-ips", "*"]
