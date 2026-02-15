"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiGetDevices, apiGetSensorData, apiGetSensors } from "@/lib/client/iot-api";
import { toUtcIsoFromDatetimeLocal } from "@/lib/utils";
import { DataTable } from "@/components/charts/data-table";
import { SensorLineChart } from "@/components/charts/sensor-line-chart";
import { DateRangePicker } from "@/components/filters/date-range-picker";
import { DevicePicker } from "@/components/filters/device-picker";
import { RollupControls } from "@/components/filters/rollup-controls";
import { SensorPicker } from "@/components/filters/sensor-picker";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { SensorDataResponse } from "@/types/iot";

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function toDatetimeLocalValue(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function inferUnitFromDescription(desc?: string) {
  if (!desc) return undefined;
  const parts = desc
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.length ? parts[parts.length - 1] : undefined;
}

export function DashboardPage() {
  const appName = process.env.NEXT_PUBLIC_APP_NAME ?? "Data Panel";

  const devicesQuery = useQuery({
    queryKey: ["devices"],
    queryFn: apiGetDevices
  });
  const devices = devicesQuery.data?.devices ?? [];

  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [sensorId, setSensorId] = useState<string | null>(null);

  const selectedDeviceId = deviceId ?? devices[0]?.name ?? "";

  const sensorsQuery = useQuery({
    queryKey: ["sensors", selectedDeviceId],
    queryFn: () => apiGetSensors(selectedDeviceId),
    enabled: Boolean(selectedDeviceId)
  });
  const sensors = sensorsQuery.data?.sensors ?? [];
  const selectedSensorId = sensorId ?? sensors[0]?.name ?? "";

  const now = useMemo(() => new Date(), []);
  const [startLocal, setStartLocal] = useState(() => toDatetimeLocalValue(new Date(now.getTime() - 24 * 60 * 60 * 1000)));
  const [endLocal, setEndLocal] = useState(() => toDatetimeLocalValue(now));

  const [rollupEnabled, setRollupEnabled] = useState(false);
  const [rollupInterval, setRollupInterval] = useState("1h");

  const [activeView, setActiveView] = useState<"chart" | "table">("chart");
  const [committed, setCommitted] = useState<{
    deviceId: string;
    sensorId: string;
    sensorName: string;
    sensorUnit?: string;
    startDate: string;
    endDate: string;
    rollup: boolean;
    interval: string;
  } | null>(null);

  const dataQuery = useQuery({
    queryKey: ["sensor-data", committed],
    queryFn: () => apiGetSensorData(committed!),
    enabled: Boolean(committed),
    staleTime: 0
  });
  const data = dataQuery.data as SensorDataResponse | undefined;

  const runQueryDisabled =
    !selectedDeviceId ||
    !selectedSensorId ||
    !startLocal ||
    !endLocal ||
    Number.isNaN(Date.parse(toUtcIsoFromDatetimeLocal(startLocal))) ||
    Number.isNaN(Date.parse(toUtcIsoFromDatetimeLocal(endLocal)));

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50">
      <header className="shrink-0 border-b border-zinc-200 bg-white">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-md bg-zinc-900" />
            <div className="text-sm font-semibold">{appName}</div>
          </div>
          <div className="text-xs text-zinc-600">
            Source:{" "}
            <span className="font-medium">
              {data?.source ?? sensorsQuery.data?.source ?? devicesQuery.data?.source ?? "—"}
            </span>
          </div>
        </div>
      </header>

      <main className="mx-auto grid w-full max-w-7xl flex-1 grid-cols-1 items-start gap-4 px-4 py-4 sm:px-6 lg:px-8 md:grid-cols-[320px_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Filters</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <DevicePicker
              devices={devices}
              value={selectedDeviceId}
              onChange={(v) => {
                setDeviceId(v);
                setSensorId(null);
              }}
              disabled={devicesQuery.isLoading}
            />

            <SensorPicker
              sensors={sensors}
              value={selectedSensorId}
              onChange={(v) => setSensorId(v)}
              disabled={!selectedDeviceId || sensorsQuery.isLoading}
            />

            <DateRangePicker
              start={startLocal}
              end={endLocal}
              onChangeStart={setStartLocal}
              onChangeEnd={setEndLocal}
              onQuickRangeDays={(days) => {
                const d = new Date();
                setEndLocal(toDatetimeLocalValue(d));
                setStartLocal(toDatetimeLocalValue(new Date(d.getTime() - days * 24 * 60 * 60 * 1000)));
              }}
            />

            <RollupControls
              enabled={rollupEnabled}
              interval={rollupInterval}
              onChangeEnabled={setRollupEnabled}
              onChangeInterval={setRollupInterval}
              suggestedInterval={data?.suggestedInterval}
            />

            <Button
              className="w-full"
              onClick={() => {
                const startDate = toUtcIsoFromDatetimeLocal(startLocal);
                const endDate = toUtcIsoFromDatetimeLocal(endLocal);
                const selectedSensor = sensors.find((s) => s.name === selectedSensorId);
                const sensorUnit = inferUnitFromDescription(selectedSensor?.attributes?.description?.text);
                setCommitted({
                  deviceId: selectedDeviceId,
                  sensorId: selectedSensorId,
                  sensorName: selectedSensorId,
                  sensorUnit,
                  startDate,
                  endDate,
                  rollup: rollupEnabled,
                  interval: rollupInterval
                });
              }}
              disabled={runQueryDisabled}
            >
              Run query
            </Button>
          </CardContent>
        </Card>

        <div>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Results</CardTitle>
              <div className="flex gap-2">
                <Button variant={activeView === "chart" ? "primary" : "secondary"} size="sm" onClick={() => setActiveView("chart")}>
                  Chart
                </Button>
                <Button variant={activeView === "table" ? "primary" : "secondary"} size="sm" onClick={() => setActiveView("table")}>
                  Table
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {!committed ? (
                <div className="rounded-md border border-zinc-200 bg-white p-6 text-sm text-zinc-600">
                  Pick a device/sensor + date range, then click <span className="font-medium">Run query</span>.
                </div>
              ) : dataQuery.isLoading ? (
                <div className="rounded-md border border-zinc-200 bg-white p-6 text-sm text-zinc-600">Loading…</div>
              ) : dataQuery.isError ? (
                <div className="rounded-md border border-red-200 bg-red-50 p-6 text-sm text-red-700">
                  Failed to load sensor data.
                </div>
              ) : data ? (
                <>
                  {data.suggestedInterval ? (
                    <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                      Suggestion: enable roll-up and try interval <span className="font-medium">{data.suggestedInterval}</span> for
                      large ranges.
                    </div>
                  ) : null}

                  {activeView === "chart" ? (
                    <SensorLineChart
                      mode={data.mode}
                      points={data.points as any}
                      sensorName={committed.sensorName}
                      unit={committed.sensorUnit}
                    />
                  ) : (
                    <DataTable mode={data.mode} points={data.points as any} />
                  )}
                </>
              ) : null}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}

