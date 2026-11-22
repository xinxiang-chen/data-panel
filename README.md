# Digital Twin Data Panel

[![CI](https://github.com/xinxiang-chen/digital-twin-data-panel/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/xinxiang-chen/digital-twin-data-panel/actions/workflows/ci.yml)

A full-stack dashboard for building IoT sensor data: a Next.js frontend backed by a
FastAPI simulator that serves an API compatible with the original building IoT API,
with readings stored in PostgreSQL + TimescaleDB.

## Repository layout

| Path | What it is |
|---|---|
| [`frontend/`](frontend/) | Next.js app: dashboard, roll-ups, latest data, chat agent UI. See [frontend/README.md](frontend/README.md) |
| [`backend/`](backend/) | FastAPI simulator: IoT-compatible API, SQLAlchemy models, Alembic migrations, seed script |
| [`docker-compose.yml`](docker-compose.yml) | Local TimescaleDB (PostgreSQL 16) on host port 5433; optional backend container |
| [`deploy/`](deploy/) | Production stack for one VM: TimescaleDB + backend + Caddy (automatic HTTPS) |

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
cp .env.example .env      # defaults work with the compose database
uv sync
uv run alembic upgrade head
uv run python -m scripts.seed
uv run uvicorn app.main:app --reload --port 8000
```

API docs: http://localhost:8000/docs

Alternatively, run the backend in Docker instead of step 2's uvicorn (migrations run
on container start; seed once if the database is empty):

```bash
docker compose --profile app up -d --build
docker compose exec backend python -m scripts.seed
```

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

## Deployment

The backend and database run on one small VM with
[`deploy/docker-compose.prod.yml`](deploy/docker-compose.prod.yml); Caddy terminates
HTTPS and is the only service exposed. The frontend is deployed to Vercel with
`BASE_URL=https://<your API domain>` and the same `PROJECT_ID` / `API_TOKEN`.

```bash
cd deploy
cp .env.example .env      # DOMAIN, POSTGRES_PASSWORD, API_TOKEN (openssl rand -hex 32)
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml exec backend python -m scripts.seed --days 90
```

With `APP_ENV=production` (set by the prod compose file) the backend refuses to start
with a weak `API_TOKEN`, and `seed --reset` against a non-local database requires `--yes`.

### Continuous deployment

After CI passes on a push to `main`, [`deploy.yml`](.github/workflows/deploy.yml) checks
whether the commit touched `backend/` or `deploy/`. If it did, it builds the backend image,
pushes it to GHCR as `sha-<commit>` and `latest`, then connects to the VM over SSH and runs
[`deploy/deploy.sh`](deploy/deploy.sh). The script:

1. updates the checkout to the deployed commit;
2. pulls the image;
3. restarts the stack and waits for the healthchecks, rolling back to the previous image if
   the new one never becomes healthy.

Vercel deploys the frontend from the same pushes.

To deploy or roll back by hand, run this on the server:

```bash
deploy/deploy.sh ghcr.io/<owner>/digital-twin-data-panel-backend:sha-<commit>
```

The workflow reads its settings from the `production` environment:

- variables: `DEPLOY_HOST` (the API hostname, also used for SSH) and `DEPLOY_USER`
- secrets: `DEPLOY_SSH_KEY` (a dedicated key) and `DEPLOY_KNOWN_HOSTS` (the output of
  `ssh-keyscan -t ed25519 <host>`)
