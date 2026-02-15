import { NextResponse } from "next/server";
import { mockGetSensorData } from "@/lib/server/mock";
import { getRollupData, getSensorData, shouldUseMock } from "@/lib/server/iot";
import { filterRawPointsToRange, filterRollupPointsToRange, suggestRollupInterval } from "@/lib/sensor-logic";
import type { SensorDataResponse } from "@/types/iot";

function asBool(v: string | null | undefined, defaultValue: boolean) {
  if (v == null) return defaultValue;
  return v === "1" || v.toLowerCase() === "true";
}

function mapUpstreamErrorToStatus(e: unknown): { status: number; message: string } {
  const body = (e as any)?.body;
  const status = (e as any)?.status;
  const code = body?.errorCode ?? body?.code ?? body?.name;
  if (code === "TableNotFound") return { status: 404, message: "No data table found for this sensor." };
  if (typeof status === "number" && status >= 400 && status < 600) return { status, message: "Upstream API error." };
  return { status: 502, message: "Failed to reach upstream API." };
}

export async function GET(req: Request) {
  const url = new URL(req.url);

  const deviceId = url.searchParams.get("deviceId") ?? "";
  const sensorId = url.searchParams.get("sensorId") ?? "";
  const startDate = url.searchParams.get("startDate") ?? "";
  const endDate = url.searchParams.get("endDate") ?? "";

  const rollup = asBool(url.searchParams.get("rollup"), false);
  const interval = url.searchParams.get("interval") ?? "1h";
  const strictFilterToDates = asBool(url.searchParams.get("strictFilterToDates"), true);

  if (!deviceId || !sensorId) {
    return NextResponse.json({ error: "deviceId and sensorId are required" }, { status: 400 });
  }
  if (!startDate || !endDate) {
    return NextResponse.json({ error: "startDate and endDate are required (ISO strings)" }, { status: 400 });
  }

  const useMock = shouldUseMock();
  const suggestedInterval = suggestRollupInterval(startDate, endDate);

  if (useMock) {
    const points = filterRawPointsToRange(mockGetSensorData(), startDate, endDate);
    console.log(
      "[api/sensors/data] fetched:",
      points.length,
      `deviceId=${deviceId}`,
      `sensorId=${sensorId}`,
      "mode=raw",
      "source=mock"
    );
    const resp: SensorDataResponse = {
      mode: "raw",
      deviceId,
      sensorId,
      startDate,
      endDate,
      points,
      suggestedInterval,
      source: "mock"
    };
    return NextResponse.json(resp);
  }

  try {
    if (rollup) {
      const raw = await getRollupData({ deviceId, sensorId, interval, startDate, endDate, strictFilterToDates });
      const points = filterRollupPointsToRange(raw, startDate, endDate);
      console.log(
        "[api/sensors/data] fetched:",
        points.length,
        `deviceId=${deviceId}`,
        `sensorId=${sensorId}`,
        `mode=rollup`,
        `interval=${interval}`,
        "source=api"
      );
      const resp: SensorDataResponse = {
        mode: "rollup",
        deviceId,
        sensorId,
        startDate,
        endDate,
        interval,
        points,
        suggestedInterval,
        source: "api"
      };
      return NextResponse.json(resp);
    }

    const raw = await getSensorData({ deviceId, sensorId, startDate, endDate });
    const points = filterRawPointsToRange(raw, startDate, endDate);
    console.log(
      "[api/sensors/data] fetched:",
      points.length,
      `deviceId=${deviceId}`,
      `sensorId=${sensorId}`,
      "mode=raw",
      "source=api"
    );
    const resp: SensorDataResponse = {
      mode: "raw",
      deviceId,
      sensorId,
      startDate,
      endDate,
      points,
      suggestedInterval: points.length > 2000 ? suggestedInterval : undefined,
      source: "api"
    };
    return NextResponse.json(resp);
  } catch (e) {
    // Prefer a demo that always renders; still surface a useful status via header.
    const mapped = mapUpstreamErrorToStatus(e);
    const points = filterRawPointsToRange(mockGetSensorData(), startDate, endDate);
    console.log(
      "[api/sensors/data] fetched:",
      points.length,
      `deviceId=${deviceId}`,
      `sensorId=${sensorId}`,
      "mode=raw",
      `source=mock (fallback upstream=${mapped.status})`
    );
    const resp: SensorDataResponse = {
      mode: "raw",
      deviceId,
      sensorId,
      startDate,
      endDate,
      points,
      suggestedInterval,
      source: "mock"
    };
    const res = NextResponse.json(resp, { status: 200 });
    res.headers.set("x-upstream-error", `${mapped.status}:${mapped.message}`);
    return res;
  }
}

