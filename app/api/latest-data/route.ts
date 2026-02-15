import { NextResponse } from "next/server";
import type { LatestDataResponse, LatestDataRow, IoTDevice, IoTSensor } from "@/types/iot";
import { getDevices, shouldUseMock } from "@/lib/server/iot";
import { mockGetDevicesWithSensors } from "@/lib/server/mock";

function flatten(devices: IoTDevice[]): LatestDataRow[] {
  const rows: LatestDataRow[] = [];

  for (const d of devices ?? []) {
    const sensors = (d as any).sensors as IoTSensor[] | undefined;
    for (const s of sensors ?? []) {
      rows.push({
        device: d.name,
        sensor: s.name,
        description: s.attributes?.description?.text ?? null,
        latestValue: s.latestValue ?? null,
        timestamp: s.latestTimestamp ?? null,
        queriedAt: s.latestQueryTimestamp ?? null
      });
    }
  }

  return rows;
}

export async function GET() {
  const useMock = shouldUseMock();
  if (useMock) {
    const devices = mockGetDevicesWithSensors();
    const rows = flatten(devices);
    console.log("[api/latest-data] rows:", rows.length, "source=mock");
    const resp: LatestDataResponse = { source: "mock", rows };
    return NextResponse.json(resp);
  }

  try {
    const devices = await getDevices();
    const rows = flatten(devices);
    console.log("[api/latest-data] rows:", rows.length, "source=api");
    const resp: LatestDataResponse = { source: "api", rows };
    return NextResponse.json(resp);
  } catch (e) {
    const devices = mockGetDevicesWithSensors();
    const rows = flatten(devices);
    console.log("[api/latest-data] rows:", rows.length, "source=mock (fallback)");
    const resp: LatestDataResponse = { source: "mock", rows };
    return NextResponse.json(resp, { status: 200 });
  }
}

