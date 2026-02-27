"use client";

import { toNumberish } from "@/lib/sensor-logic";
import type { IoTRawPoint, IoTRollupPoint } from "@/types/iot";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceDot,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { useMemo, useState } from "react";

type RawDatum = { ts: number; value: number | null; iso: string };
type RollupDatum = { ts: number; avg: number | null; min?: number | null; max?: number | null; iso: string };

const PT_FMT = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Los_Angeles",
  month: "short",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false
});

function fmtPacificTime(ms: number) {
  const parts = PT_FMT.formatToParts(new Date(ms));
  const month = parts.find((p) => p.type === "month")?.value ?? "";
  const day = parts.find((p) => p.type === "day")?.value ?? "";
  const hour = parts.find((p) => p.type === "hour")?.value ?? "";
  const minute = parts.find((p) => p.type === "minute")?.value ?? "";
  return `${month} ${day}, ${hour}:${minute}`;
}

function computeYDomain(mode: "raw" | "rollup", data: Array<RawDatum | RollupDatum>): [number, number] | undefined {
  const values: number[] = [];
  if (mode === "raw") {
    for (const d of data as RawDatum[]) {
      if (typeof d.value === "number" && Number.isFinite(d.value)) values.push(d.value);
    }
  } else {
    for (const d of data as RollupDatum[]) {
      for (const v of [d.avg, d.min, d.max]) {
        if (typeof v === "number" && Number.isFinite(v)) values.push(v);
      }
    }
  }

  if (values.length === 0) return undefined;

  let min = Math.min(...values);
  let max = Math.max(...values);

  if (min === max) {
    const delta = min === 0 ? 1 : Math.abs(min) * 0.1;
    return [min - delta, max + delta];
  }

  const pad = (max - min) * 0.05;
  min -= pad;
  max += pad;
  return [min, max];
}

function fmtNumber(n: number | null, digits = 3) {
  if (n == null || !Number.isFinite(n)) return "—";
  return String(Number(n.toFixed(digits)));
}

export function SensorLineChart({
  mode,
  points,
  sensorName,
  unit
}: {
  mode: "raw" | "rollup";
  points: IoTRawPoint[] | IoTRollupPoint[];
  sensorName: string;
  unit?: string;
}) {
  const [hover, setHover] = useState<{ ts: number; value: number | null } | null>(null);

  const data =
    mode === "raw"
      ? (points as IoTRawPoint[])
          .map<RawDatum>((p) => {
            const ts = Date.parse(p.timestamp);
            return { ts, iso: p.timestamp, value: toNumberish(p.value) };
          })
          .filter((d) => Number.isFinite(d.ts))
      : (points as IoTRollupPoint[])
          .map<RollupDatum>((p) => {
            const ts = Date.parse(p.startTime);
            return {
              ts,
              iso: p.startTime,
              avg: toNumberish((p as any).avg ?? (p as any).mean ?? (p as any).value),
              min: toNumberish((p as any).min),
              max: toNumberish((p as any).max)
            };
          })
          .filter((d) => Number.isFinite(d.ts));

  const primarySeries = useMemo(() => {
    if (mode === "raw") {
      return (data as RawDatum[]).map((d) => ({ ts: d.ts, value: d.value }));
    }
    return (data as RollupDatum[]).map((d) => ({ ts: d.ts, value: d.avg ?? null }));
  }, [data, mode]);

  const stats = useMemo(() => {
    let count = 0;
    let sum = 0;
    let min: { ts: number; value: number } | null = null;
    let max: { ts: number; value: number } | null = null;

    for (const p of primarySeries) {
      const v = p.value;
      if (typeof v !== "number" || !Number.isFinite(v)) continue;
      count += 1;
      sum += v;
      if (!min || v < min.value) min = { ts: p.ts, value: v };
      if (!max || v > max.value) max = { ts: p.ts, value: v };
    }

    return { count, min, max, avg: count > 0 ? sum / count : null };
  }, [primarySeries]);

  const chartData = useMemo(() => {
    if (stats.avg == null) return data as any[];
    return (data as any[]).map((d) => ({ ...d, overallAvg: stats.avg }));
  }, [data, stats.avg]);

  const yDomain = computeYDomain(mode, data as any);

  return (
    <div className="h-[360px] w-full">
      <div className="mb-2 text-xs text-zinc-600">
        {hover ? (
          <span className="mr-2">
            {fmtPacificTime(hover.ts)}: <span className="font-medium text-zinc-900">{hover.value ?? "—"}</span>
          </span>
        ) : null}
        {stats.count > 0 ? (
          <span>
            min {fmtNumber(stats.min?.value ?? null)} · avg {fmtNumber(stats.avg)} · max {fmtNumber(stats.max?.value ?? null)}
          </span>
        ) : null}
      </div>

      <ResponsiveContainer>
        <LineChart
          data={chartData}
          margin={{ top: 10, right: 20, left: 0, bottom: 10 }}
          onMouseMove={(e: any) => {
            const payload = e?.activePayload?.[0]?.payload;
            if (payload && typeof payload.ts === "number") {
              const value = mode === "raw" ? payload.value ?? null : payload.avg ?? null;
              setHover({ ts: payload.ts, value });
            }
          }}
          onMouseLeave={() => setHover(null)}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
          <XAxis
            dataKey="ts"
            type="number"
            domain={["dataMin", "dataMax"]}
            scale="time"
            tickCount={6}
            interval="preserveStartEnd"
            minTickGap={24}
            tickFormatter={(v) => fmtPacificTime(Number(v))}
          />
          <YAxis
            tickFormatter={(v) => String(v)}
            width={50}
            domain={yDomain ?? ["auto", "auto"]}
            label={
              unit
                ? {
                    value: unit,
                    angle: -90,
                    position: "insideLeft",
                    offset: 10
                  }
                : undefined
            }
          />
          <Tooltip
            formatter={(value: any, name: any) => [value, String(name)]}
            labelFormatter={(label) => fmtPacificTime(Number(label))}
          />
          <Legend />
          {stats.avg != null ? (
            <Line
              type="monotone"
              dataKey="overallAvg"
              name="Average"
              stroke="#2563eb"
              strokeWidth={1.5}
              strokeDasharray="4 4"
              dot={false}
              isAnimationActive={false}
            />
          ) : null}
          {mode === "raw" ? (
            <Line
              type="monotone"
              dataKey="value"
              name={sensorName}
              stroke="#18181b"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
              isAnimationActive={false}
            />
          ) : (
            <>
              <Line
                type="monotone"
                dataKey="avg"
                name={sensorName}
                stroke="#18181b"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey="min"
                name="Min"
                stroke="#71717a"
                strokeWidth={1}
                dot={false}
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey="max"
                name="Max"
                stroke="#71717a"
                strokeWidth={1}
                dot={false}
                isAnimationActive={false}
              />
            </>
          )}
          {stats.max ? (
            <ReferenceDot x={stats.max.ts} y={stats.max.value} r={5} fill="#ef4444" stroke="#ef4444" />
          ) : null}
          {stats.min ? (
            <ReferenceDot x={stats.min.ts} y={stats.min.value} r={5} fill="#22c55e" stroke="#22c55e" />
          ) : null}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

