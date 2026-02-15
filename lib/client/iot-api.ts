import type { IoTDevice, IoTSensor, SensorDataResponse, LatestDataResponse } from "@/types/iot";
import { fetchJson } from "@/lib/client/api-client";

export type DevicesResponse = { source: "api" | "mock"; devices: IoTDevice[] };
export type SensorsResponse = { source: "api" | "mock"; deviceId: string; sensors: IoTSensor[] };

export async function apiGetDevices() {
  return await fetchJson<DevicesResponse>("/api/devices");
}

export async function apiGetSensors(deviceId: string) {
  return await fetchJson<SensorsResponse>(`/api/devices/${encodeURIComponent(deviceId)}/sensors`);
}

export async function apiGetSensorData(params: {
  deviceId: string;
  sensorId: string;
  startDate: string;
  endDate: string;
  rollup: boolean;
  interval: string;
}) {
  const url = new URL("/api/sensors/data", window.location.origin);
  url.searchParams.set("deviceId", params.deviceId);
  url.searchParams.set("sensorId", params.sensorId);
  url.searchParams.set("startDate", params.startDate);
  url.searchParams.set("endDate", params.endDate);
  url.searchParams.set("rollup", params.rollup ? "1" : "0");
  url.searchParams.set("interval", params.interval);
  return await fetchJson<SensorDataResponse>(url.toString());
}

export async function apiGetLatestData() {
  return await fetchJson<LatestDataResponse>("/api/latest-data");
}

