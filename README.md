## Data Panel

A **Next.js (App Router)** dashboard for exploring digital twin sensor data:

- **Dashboard**: pick a device + sensor + date range, then visualize results as a **chart** or **table**
- **Roll-up mode**: query aggregated series (e.g. `1h`, `6h`, `1d`) and get interval suggestions for large ranges
- **Latest Data**: browse “latest value” snapshots across devices/sensors
- **Chat Agent**: a simple chat UI that proxies requests to a local **n8n Chat Trigger** workflow

Tech: Next.js, TypeScript, React Query, Recharts, TanStack Table, Tailwind CSS, react-markdown.

---

## Quick start

### Prerequisites

- Node.js 18+ (recommended: 20+)
- npm

### Install

```bash
npm install
```

### Configure environment

Create `.env.local` (or update it) with **placeholders** like:

```bash
# IoT API (optional; app can run in mock mode)
BASE_URL=https://<your-iot-host>
PROJECT_ID=<your-project-id>
API_TOKEN=<your-api-token>

# App
NEXT_PUBLIC_APP_NAME=GCS Living Lab Dashboard

# n8n chat agent (optional)
N8N_CHAT_WEBHOOK_URL=http://localhost:5678/webhook/<your-chat-trigger-path>

# Force mock mode (optional)
# USE_MOCK=1
```

Notes:
- **Do not commit** real tokens. `.env.local` is ignored by `.gitignore`.
- If your app runs in Docker and n8n runs on your host, you may need `http://host.docker.internal:5678/...` instead of `localhost`.

### Run

```bash
npm run dev
```

Run on a different port:

```bash
npm run dev -- --port 3005
```

Open:
- `/` — Dashboard
- `/latest-data` — Latest Data explorer
- `/chat-agent` — n8n Chat Agent UI

---

## Features

### Dashboard (time-series query)

- **Filters**: device, sensor, date range, roll-up toggle + interval
- **Views**:
  - Chart: `components/charts/sensor-line-chart.tsx` (Recharts)
  - Table: `components/charts/data-table.tsx` (TanStack Table + CSV export)

Implementation:
- Device list loads from `GET /api/devices`
- Sensor list loads from `GET /api/devices/:deviceId/sensors`
- Query runs via `GET /api/sensors/data` using UTC ISO strings with microseconds (see `lib/utils.ts`)

### Roll-up mode + large-range handling

The sensor-data route supports:
- **raw series** (`.../data`)
- **rollup series** (`.../rollups`) with `interval`

For reliability across big windows:
- Suggests a roll-up interval using `lib/sensor-logic.ts`
- Supports cross-month ranges by splitting requests by UTC month and de-duping timestamps in `app/api/sensors/data/route.ts`

### Latest Data (snapshot)

`/latest-data` displays a flattened table of latest readings (device, sensor, description, latest value, timestamps), loaded from:

- `GET /api/latest-data`

### Chat Agent (n8n)

`/chat-agent` is a chat UI backed by a Next.js proxy:

- UI: `components/chat/chat-agent-page.tsx` (supports **Markdown** in agent replies)
- Proxy: `POST /api/chat-agent` → forwards to `N8N_CHAT_WEBHOOK_URL`

The proxy sends this payload to n8n:

```json
{ "action": "sendMessage", "sessionId": "...", "chatInput": "..." }
```

---

## API routes (server-side proxy)

- `GET /api/devices`
  - **Returns**: `{ source: "api" | "mock", devices: IoTDevice[] }`
  - **File**: `app/api/devices/route.ts`

- `GET /api/devices/:deviceId/sensors`
  - **Returns**: `{ source: "api" | "mock", deviceId, sensors: IoTSensor[] }`
  - **File**: `app/api/devices/[deviceId]/sensors/route.ts`

- `GET /api/sensors/data?deviceId=...&sensorId=...&startDate=...&endDate=...&rollup=0|1&interval=1h`
  - **Returns**: `SensorDataResponse` (raw or rollup)
  - **File**: `app/api/sensors/data/route.ts`

- `GET /api/latest-data`
  - **Returns**: `{ source: "api" | "mock", rows: LatestDataRow[] }`
  - **File**: `app/api/latest-data/route.ts`

- `POST /api/chat-agent`
  - **Body**: `{ "message": "...", "sessionId": "..." }`
  - **Returns**: `{ reply: string, raw?: unknown }`
  - **File**: `app/api/chat-agent/route.ts`

---

## Mock mode

The app automatically uses mock data if IoT env vars are missing, or if you force it:

- `USE_MOCK=1`

Mock data lives in:
- `data/mock/devices.json`
- `data/mock/sensors.json`
- `data/mock/sensor-data.json`
- `data/mock/devices-with-sensors.json`

The mock layer is in `lib/server/mock.ts`.

---

## Utility scripts (data cleaning)

These scripts help convert large IoT JSON payloads into n8n-friendly shapes.

### Clean devices JSON (device → sensors list)

- **Input**: raw `devices-*.json` (device objects including `sensors`)
- **Output**: compact structure

```bash
node scripts/clean-devices-json.js <inputPath> <outputPath>
```

Output shape:

```json
[
  {
    "device_name": "GCS_AHU1",
    "sensors": [{ "sensor_name": "GCS_AHU1DaTemp", "descprtion": "..." }]
  }
]
```

### Extract device names

```bash
node scripts/extract-device-names.js <inputPath> <outputPath>
```

---

## Project structure

- `app/` — Next.js pages + API routes
  - `app/page.tsx` — dashboard entry
  - `app/latest-data/page.tsx` — latest-data entry
  - `app/chat-agent/page.tsx` — chat agent entry
- `components/` — UI + feature components (filters, charts, tables, chat)
- `lib/` — client API wrappers, server IoT client, utils, roll-up logic
- `types/` — shared TypeScript types for IoT shapes
- `data/mock/` — mock fixtures used in demo mode
