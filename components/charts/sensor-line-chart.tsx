"use client";

import { toNumberish } from "@/lib/sensor-logic";
import type { IoTRawPoint, IoTRollupPoint } from "@/types/iot";
import { format } from "date-fns";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";

type RawDatum = { ts: number; value: number | null; iso: string };
type RollupDatum = { ts: number; avg: number | null; min?: number | null; max?: number | null; iso: string };

function fmtLocalTime(ms: number) {
  // Local time in the browser.
  return format(new Date(ms), "MMM dd, HH:mm");
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

  return (
    <div className="h-[360px] w-full">
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 10, right: 20, left: 0, bottom: 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
          <XAxis
            dataKey="ts"
            type="number"
            domain={["dataMin", "dataMax"]}
            scale="time"
            tickCount={6}
            interval="preserveStartEnd"
            minTickGap={24}
            tickFormatter={(v) => fmtLocalTime(Number(v))}
          />
          <YAxis
            tickFormatter={(v) => String(v)}
            width={50}
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
            labelFormatter={(label) => fmtLocalTime(Number(label))}
          />
          <Legend />
          {mode === "raw" ? (
            <Line
              type="monotone"
              dataKey="value"
              name={sensorName}
              stroke="#18181b"
              strokeWidth={2}
              dot={false}
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
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

