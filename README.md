# Sensor Data Panel

[![CI](https://github.com/xinxiang-chen/data-panel/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/xinxiang-chen/data-panel/actions/workflows/ci.yml)

A full-stack dashboard for building IoT sensor data: a Next.js frontend backed by a
FastAPI simulator that serves an API compatible with the original building IoT API,
with readings stored in PostgreSQL + TimescaleDB.

## Repository layout

| Path | What it is |
|---|---|
| [`frontend/`](frontend/) | Next.js app: dashboard, roll-ups, latest data, chat agent UI. See [frontend/README.md](frontend/README.md) |
| [`backend/`](backend/) | FastAPI simulator: IoT-compatible API, SQLAlchemy models, Alembic migrations, seed script |
| [`docker-compose.yml`](docker-compose.yml) | Local TimescaleDB (PostgreSQL 16) on host port 5433 |

```
Browser ─► Next.js (frontend/) ── /api/* proxy ──► FastAPI (backend/) ──► Postgres + TimescaleDB
```

## Quick start

Prerequisites: Docker, [uv](https://docs.astral.sh/uv/), Node.js 20+.

**1. Database**

```bash
docker compose up -d
```

**2. Backend** (from `backend/`)

```bash
cp .env.example .env      # then fill in DATABASE_URL / PROJECT_ID / API_TOKEN
uv sync
uv run alembic upgrade head
uv run python -m scripts.seed
uv run uvicorn app.main:app --reload --port 8000
```

Example `.env` for local development:

```bash
DATABASE_URL=postgresql+asyncpg://postgres:postgres@localhost:5433/sensor_sim
PROJECT_ID=demo
API_TOKEN=dev
```

API docs: http://localhost:8000/docs

**3. Frontend** (from `frontend/`)

```bash
npm install
npm run dev
```

Point the frontend at the backend in `frontend/.env.local` (must match the backend's
`PROJECT_ID` / `API_TOKEN`):

```bash
BASE_URL=http://localhost:8000
PROJECT_ID=demo
API_TOKEN=dev
```

Open http://localhost:3000. The header shows `Source: api` when data comes from the
backend (it falls back to `mock` if the backend is unreachable).
