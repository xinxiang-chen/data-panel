import type { IoTRawPoint, IoTRollupPoint, IoTSensor, IoTDevice } from "@/types/iot";

function getRequiredEnv(name: string): string | undefined {
  const v = process.env[name];
  return v && v.trim().length ? v.trim() : undefined;
}

export function shouldUseMock(): boolean {
  if (process.env.USE_MOCK === "1") return true;
  const baseUrl = getRequiredEnv("BASE_URL");
  const projectId = getRequiredEnv("PROJECT_ID");
  const token = getRequiredEnv("API_TOKEN");
  return !baseUrl || !projectId || !token;
}

function authHeaders(): HeadersInit {
  const token = getRequiredEnv("API_TOKEN");
  if (!token) return {};

  const bearer = token.toLowerCase().startsWith("bearer ") ? token : `Bearer ${token}`;
  return {
    Authorization: bearer,
    "x-api-token": token
  };
}

function baseApiUrl(): string {
  const baseUrl = getRequiredEnv("BASE_URL");
  const projectId = getRequiredEnv("PROJECT_ID");
  if (!baseUrl || !projectId) {
    throw new Error("Missing BASE_URL or PROJECT_ID");
  }
  return `${baseUrl.replace(/\/$/, "")}/api/${projectId}`;
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    headers: {
      ...authHeaders(),
      Accept: "application/json"
    },
    cache: "no-store"
  });

  if (res.ok) return (await res.json()) as T;

  const text = await res.text();
  let json: unknown = undefined;
  try {
    json = JSON.parse(text);
  } catch {
    // ignore
  }

  const err = new Error(`Upstream error ${res.status}`);
  (err as any).status = res.status;
  (err as any).body = json ?? text;
  throw err;
}

export async function getDevices(): Promise<IoTDevice[]> {
  return await fetchJson<IoTDevice[]>(`${baseApiUrl()}/devices`);
}

export async function getSensors(deviceId: string): Promise<IoTSensor[]> {
  return await fetchJson<IoTSensor[]>(`${baseApiUrl()}/devices/${encodeURIComponent(deviceId)}/sensors`);
}

export async function getSensorData(params: {
  deviceId: string;
  sensorId: string;
  startDate: string;
  endDate: string;
}): Promise<IoTRawPoint[]> {
  const url = new URL(
    `${baseApiUrl()}/devices/${encodeURIComponent(params.deviceId)}/sensors/${encodeURIComponent(params.sensorId)}/data`
  );
  url.searchParams.set("startDate", params.startDate);
  url.searchParams.set("endDate", params.endDate);
  return await fetchJson<IoTRawPoint[]>(url.toString());
}

export async function getRollupData(params: {
  deviceId: string;
  sensorId: string;
  interval: string;
  startDate: string;
  endDate: string;
  strictFilterToDates: boolean;
}): Promise<IoTRollupPoint[]> {
  const url = new URL(
    `${baseApiUrl()}/devices/${encodeURIComponent(params.deviceId)}/sensors/${encodeURIComponent(params.sensorId)}/rollups`
  );
  url.searchParams.set("interval", params.interval);
  url.searchParams.set("startDate", params.startDate);
  url.searchParams.set("endDate", params.endDate);
  url.searchParams.set("strictFilterToDates", String(params.strictFilterToDates).toLowerCase());
  return await fetchJson<IoTRollupPoint[]>(url.toString());
}

