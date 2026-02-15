import { NextResponse } from "next/server";
import { mockGetSensorData } from "@/lib/server/mock";
import { getRollupData, getSensorData, shouldUseMock } from "@/lib/server/iot";
import { filterRawPointsToRange, filterRollupPointsToRange, suggestRollupInterval } from "@/lib/sensor-logic";
import type { SensorDataResponse } from "@/types/iot";
import type { IoTRawPoint } from "@/types/iot";

function asBool(v: string | null | undefined, defaultValue: boolean) {
  if (v == null) return defaultValue;
  return v === "1" || v.toLowerCase() === "true";
}

function parseMs(iso: string): number {
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : NaN;
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}
function pad6(n: number) {
  return String(n).padStart(6, "0");
}
function toUtcIsoMicroZ(d: Date) {
  const y = d.getUTCFullYear();
  const m = pad2(d.getUTCMonth() + 1);
  const day = pad2(d.getUTCDate());
  const hh = pad2(d.getUTCHours());
  const mm = pad2(d.getUTCMinutes());
  const ss = pad2(d.getUTCSeconds());
  const micros = pad6(d.getUTCMilliseconds() * 1000);
  return `${y}-${m}-${day}T${hh}:${mm}:${ss}.${micros}Z`;
}

function monthKeyUtc(ms: number) {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}`;
}

function splitByUtcMonth(startIso: string, endIso: string): Array<{ startDate: string; endDate: string }> {
  const startMs = parseMs(startIso);
  const endMs = parseMs(endIso);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || startMs >= endMs) {
    return [{ startDate: startIso, endDate: endIso }];
  }

  const segs: Array<{ startDate: string; endDate: string }> = [];
  let cur = startMs;
  const maxSegs = 36; // safety

  for (let i = 0; i < maxSegs; i++) {
    const d = new Date(cur);
    const nextMonthStart = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1, 0, 0, 0, 0)).getTime();
    const segEnd = Math.min(endMs, nextMonthStart);
    segs.push({ startDate: toUtcIsoMicroZ(new Date(cur)), endDate: toUtcIsoMicroZ(new Date(segEnd)) });
    if (segEnd >= endMs) break;
    cur = segEnd; // next segment starts at boundary; we'll dedupe overlaps by timestamp
  }

  return segs;
}

function dedupeAndSortRaw(points: IoTRawPoint[]): IoTRawPoint[] {
  const byTs = new Map<string, IoTRawPoint>();
  for (const p of points) {
    if (!p?.timestamp) continue;
    byTs.set(p.timestamp, p);
  }
  return Array.from(byTs.values()).sort((a, b) => parseMs(a.timestamp) - parseMs(b.timestamp));
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

    const startMs = parseMs(startDate);
    const endMs = parseMs(endDate);
    const spansMonths =
      Number.isFinite(startMs) && Number.isFinite(endMs) && monthKeyUtc(startMs) !== monthKeyUtc(endMs);

    let raw: IoTRawPoint[] = [];
    if (spansMonths) {
      const segs = splitByUtcMonth(startDate, endDate);
      console.log(
        "[api/sensors/data] month-split",
        segs.length,
        `deviceId=${deviceId}`,
        `sensorId=${sensorId}`,
        `from=${segs[0]?.startDate}`,
        `to=${segs[segs.length - 1]?.endDate}`
      );
      for (const seg of segs) {
        const part = await getSensorData({ deviceId, sensorId, startDate: seg.startDate, endDate: seg.endDate });
        raw = raw.concat(part ?? []);
      }
      raw = dedupeAndSortRaw(raw);
    } else {
      raw = await getSensorData({ deviceId, sensorId, startDate, endDate });
    }

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

