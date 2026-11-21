import type { IoTRawPoint, IoTRollupPoint } from "@/types/iot";

function toMs(iso: string): number {
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : NaN;
}

export function filterRawPointsToRange(points: IoTRawPoint[], startIso: string, endIso: string): IoTRawPoint[] {
  const start = toMs(startIso);
  const end = toMs(endIso);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return points;
  return points.filter((p) => {
    const t = toMs(p.timestamp);
    return Number.isFinite(t) && t >= start && t <= end;
  });
}

export function filterRollupPointsToRange(
  points: IoTRollupPoint[],
  startIso: string,
  endIso: string
): IoTRollupPoint[] {
  const start = toMs(startIso);
  const end = toMs(endIso);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return points;
  return points.filter((p) => {
    const t = toMs(p.startTime);
    return Number.isFinite(t) && t >= start && t <= end;
  });
}

export function suggestRollupInterval(startIso: string, endIso: string): string | undefined {
  const start = toMs(startIso);
  const end = toMs(endIso);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return undefined;

  const dur = Math.max(0, end - start);

  // Keep it simple and predictable for a demo.
  // Hour-only intervals: 1,2,3,4,6,8,12,24h
  if (dur <= 2 * 24 * 60 * 60 * 1000) return "1h";
  if (dur <= 7 * 24 * 60 * 60 * 1000) return "2h";
  if (dur <= 14 * 24 * 60 * 60 * 1000) return "4h";
  if (dur <= 30 * 24 * 60 * 60 * 1000) return "6h";
  if (dur <= 60 * 24 * 60 * 60 * 1000) return "12h";
  return "24h";
}

export function toNumberish(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

