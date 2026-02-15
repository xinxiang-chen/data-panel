# Objectives:

1. Customized the data searching function, mapping with specific API calls, e.g.
    1. support data range for data retrival (API supported)
    2. support if get roll up data (API supported)
    3. support choosing different devices, or sensors(sensor including in devices), a filter
2. support table/figure view
3. AI Agent support NL queries and summarize (not for this phase)

# API formats

1. getAllDevices

```jsx
def get_devices(project_id):
    url = f'{BASE_URL}/api/{project_id}/devices'
    response = requests.get(url, headers=headers)
    if response.status_code == 200:
        devices = response.json()
        print(f"{ len(devices) } Devices retrieved successfully: ")
        for device in devices:
            print(f"Device ID: {device['name']}")
        return devices
    else:
        print(f"Failed to retrieve devices. Status code: {response.status_code}")
        return None

devices = get_devices(project_id)

return: all devices name
```

1. getLatestSensorData

```jsx
def get_sensors(project_id, device_id):
    url = f'{BASE_URL}/api/{project_id}/devices/{device_id}/sensors'
    response = requests.get(url, headers=headers)
    if response.status_code == 200:
        sensors = response.json()
        print(f"Sensors for Device '{device_id}':")
        for sensor in sensors:
            print(f"Sensor Name: {sensor['name']}, ({sensor['attributes']['description']['text']}) value: {sensor['latestValue']} timestamp (UTC): {sensor['latestTimestamp']} latestQuality: {sensor['latestQuality']} ")
        return sensors
    else:
        print(f"Failed to retrieve sensors. Status code: {response.status_code}")
        return None

sensors = get_sensors(project_id, device_id)

return: All the latest sensor data under device_id
```

1. getSensorDataWithRange

```jsx
def get_sensor_data(project_id, device_id, sensor_id, start_date, end_date):
    print(f"Getting data for {start_date} to {end_date}")
    url = f'{BASE_URL}/api/{project_id}/devices/{device_id}/sensors/{sensor_id}/data'
    params = {
        'startDate': start_date,
        'endDate': end_date
    }
    print(url)
    response = requests.get(url, headers=headers, params=params)
    if response.status_code == 200:
        data = response.json()
        print(f"Data points retrieved: {len(data)}")
        print(data)
        return data
    else:
        print(f"Failed to retrieve sensor data. Status code: {response.status_code}")
        return None

sensor_data = get_sensor_data(project_id, device_id, sensor_id, start_date_str, end_date_str)
print(len(sensor_data))
from datetime import datetime
start_d = datetime.strptime(start_date_str, "%Y-%m-%dT%H:%M:%S.%fZ")
sensor_data = [point for point in sensor_data if datetime.strptime(point['timestamp'], "%Y-%m-%dT%H:%M:%S.%fZ") >= start_d]
print(sensor_data)
print(len(sensor_data))
print('First point:', sensor_data[-1])

return: a collecion of this specific sensor data within date range
```

1. getRollUpData

```jsx
def get_rollup_data(project_id, device_id, sensor_id, interval, start_date, end_date, strict_filter=True):
    url = f'{BASE_URL}/api/{project_id}/devices/{device_id}/sensors/{sensor_id}/rollups'
    params = {
        'interval': interval,
        'startDate': start_date,
        'endDate': end_date,
        'strictFilterToDates': str(strict_filter).lower()
    }
    response = requests.get(url, headers=headers, params=params)
    if response.status_code == 200:
        data = response.json()
        print(f"Rollup data points retrieved: {len(data)}")
        return data
    else:
        print(f"Failed to retrieve rollup data. Status code: {response.status_code}")
        return None

rollup_data = get_rollup_data(project_id, device_id, sensor_id, interval, start_date_str, end_date_str)
from datetime import datetime
start_d = datetime.strptime(start_date_str, "%Y-%m-%dT%H:%M:%S.%fZ")
rollup_data = [point for point in rollup_data if datetime.strptime(point['startTime'], "%Y-%m-%dT%H:%M:%S.%fZ") >= start_d]
print('First point: ',rollup_data[0])
rollup_data[1]
```

# Technical Goals

1. fetch the data via API (python or js?)
2. an frontend page that display the data (node or next?)
3. table/graph view, using some frontend library is good

# Tech Plan

## 1. Project Initialization & Architecture

- **Framework:** Initialize a **Next.js 14+ (App Router)** project.
- **Folder Structure:** * `/app/api/...`: Server-side API routes (acting as your proxy).
    - `/components/...`: UI elements (Charts, Tables, Selectors).
    - `/lib/...`: Shared utility functions for date formatting and API fetching.
- **Environment Variables:** Store `BASE_URL`, `PROJECT_ID`, and `API_TOKEN` in a `.env.local` file to keep them out of the frontend code.

---

## 2. Backend Proxy Layer (The "Safe" Bridge)

Create a unified API route in Next.js to handle all your IoT requests. This mirrors your Python logic but lives inside the Next.js server.

- **Route Handling:** Create `app/api/sensors/route.ts` to handle dynamic queries.
- **Data Massaging:** Implement the "Roll-up" manual filtering logic here. If the IoT API returns more data than requested due to interval alignment, filter those extra points before sending the JSON to the browser.
- **Error Mapping:** Map IoT error codes (like the `TableNotFound` you've encountered before) to clean, user-friendly HTTP responses.

---

## 3. Frontend Component Design

Divide the dashboard into three functional zones:

### **A. Configuration Sidebar (The Filter)**

- **Device/Sensor Select:** Fetch `getAllDevices` on page load. When a device is picked, fetch its specific sensors via `getLatestSensorData`.
- **Date Range Picker:** Use `shadcn/ui` (Calendar component).
- **Roll-up Toggle:** A switch to enable/disable the `getRollUpData` API call, with a dropdown for "Interval" (e.g., 1m, 5m, 1h).

### **B. Visualization Engine (The "Figure" View)**

- **Library:** **Recharts** is ideal for time-series IoT data.
- **Implementation:** * Use a `LineChart` for continuous sensor readings.
    - Implement **ResponsiveContainer** so it looks good on both your MacBook and mobile.
    - **Tooltip Customization:** Show the exact timestamp and unit on hover.

### **C. Data Inspector (The "Table" View)**

- **Library:** **TanStack Table**.
- **Features:** Pagination and "Export to CSV" (very useful for research/graduate projects).

---

## 4. State Management & Data Fetching

- **Library:** **TanStack Query (React Query)**.
- **Why:** * It handles "Loading..." and "Error" states automatically.
    - **Caching:** If you switch from Table to Graph and back, it won't re-fetch the data from the API.
    - **Polling:** You can set a `refetchInterval` to keep the "Latest Sensor Data" live without refreshing the page.

---

## 5. Technical Challenges & Solutions

- **Date Serialization:** The IoT API expects `%Y-%m-%dT%H:%M:%S.%fZ`. Use `date-fns` on the frontend to ensure your Date objects are formatted correctly before the API call.
- **Large Dataset Handling:** If a range returns >2000 points, Recharts can lag.
    - *Solution:* Add logic to the Backend Proxy to automatically suggest a larger "Roll-up interval" if the date range is too wide.

---

## File Structure Reference

```jsx
my-sensor-app/
├── app/                      # Next.js App Router
│   ├── api/                  # The "Backend" Proxy Layer
│   │   ├── devices/          # Endpoint for getAllDevices
│   │   │   └── route.ts
│   │   └── sensors/          # Main data fetching logic
│   │       ├── [id]/         # Dynamic route for getLatestSensorData
│   │       │   └── route.ts
│   │       └── data/         # Range and Rollup logic
│   │           └── route.ts
│   ├── layout.tsx            # Global UI (Navbar/Sidebar)
│   └── page.tsx              # Main Dashboard Page (Client Components here)
├── components/               # UI Building Blocks
│   ├── ui/                   # Shadcn/UI primitives (Buttons, Inputs, Selects)
│   ├── charts/               # Visualization Logic
│   │   ├── sensor-line-chart.tsx
│   │   └── data-table.tsx
│   └── filters/              # Control Panel components
│       ├── device-picker.tsx
│       └── date-range-picker.tsx
├── lib/                      # Shared Utilities
│   ├── api-client.ts         # Axios/Fetch wrapper for frontend
│   ├── utils.ts              # Tailwind merger / date formatting
│   └── sensor-logic.ts       # Manual filtering/rollup math (JS version of your Python)
├── types/                    # TypeScript Interfaces
│   └── sensor.d.ts           # Define Device and Sensor shapes
├── .env.local                # BASE_URL, PROJECT_ID, API_TOKEN
├── next.config.js
└── package.json
```