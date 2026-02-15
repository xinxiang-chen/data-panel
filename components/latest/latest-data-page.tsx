"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { apiGetLatestData } from "@/lib/client/iot-api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LatestDataTable } from "@/components/latest/latest-data-table";
import { Combobox } from "@/components/ui/combobox";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useMemo, useState } from "react";
import type { LatestDataRow } from "@/types/iot";

const EMPTY_ROWS: LatestDataRow[] = [];

export function LatestDataPage() {
  const appName = process.env.NEXT_PUBLIC_APP_NAME ?? "Data Panel";
  const [device, setDevice] = useState("");
  const [sensor, setSensor] = useState("");
  const [onlyHasValue, setOnlyHasValue] = useState(false);

  const q = useQuery({
    queryKey: ["latest-data"],
    queryFn: apiGetLatestData,
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: Number.POSITIVE_INFINITY,
    retry: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
    refetchOnWindowFocus: false
  });

  const rows = useMemo(() => q.data?.rows ?? EMPTY_ROWS, [q.data?.rows]);

  const deviceItems = useMemo(() => {
    const uniq = Array.from(new Set(rows.map((r) => r.device).filter(Boolean)));
    uniq.sort((a, b) => a.localeCompare(b));
    return uniq.map((d) => ({ value: d, label: d }));
  }, [rows]);

  const sensorItems = useMemo(() => {
    const base = device ? rows.filter((r) => r.device === device) : rows;
    const map = new Map<string, string | null>();
    for (const r of base) {
      if (!r.sensor) continue;
      if (!map.has(r.sensor)) map.set(r.sensor, r.description ?? null);
    }
    const sensors = Array.from(map.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([name, desc]) => ({
        value: name,
        label: desc ? `${name} — ${desc}` : name,
        keywords: desc ?? ""
      }));
    return sensors;
  }, [device, rows]);

  const filteredRows = useMemo(() => {
    return rows.filter((r) => {
      if (device && r.device !== device) return false;
      if (sensor && r.sensor !== sensor) return false;
      if (onlyHasValue) {
        const v = r.latestValue;
        if (v === null || v === undefined) return false;
        if (typeof v === "string" && v.trim() === "") return false;
      }
      return true;
    });
  }, [device, onlyHasValue, rows, sensor]);

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50">
      <header className="shrink-0 border-b border-zinc-200 bg-white">
        <div className="mx-auto flex w-full max-w-screen-2xl items-center justify-between px-2 py-2 sm:px-3 lg:px-4">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-md bg-zinc-900" />
            <div className="text-sm font-semibold">{appName}</div>
            <nav className="ml-3 flex items-center gap-3 text-xs text-zinc-600">
              <Link className="hover:text-zinc-900" href="/">
                Dashboard
              </Link>
              <span className="text-zinc-300">/</span>
              <span className="font-medium text-zinc-900">Latest Data</span>
            </nav>
          </div>
          <div className="text-xs text-zinc-600">
            Source: <span className="font-medium">{q.data?.source ?? "—"}</span>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-screen-2xl flex-1 px-2 py-2 sm:px-3 lg:px-4">
        <Card>
          <CardHeader>
            <CardTitle>Device latest sensor data</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {q.isLoading ? (
              <div className="rounded-md border border-zinc-200 bg-white p-6 text-sm text-zinc-600">Loading…</div>
            ) : q.isError ? (
              <div className="rounded-md border border-red-200 bg-red-50 p-6 text-sm text-red-700">Failed to load.</div>
            ) : (
              <>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="latest-device">Device</Label>
                    <Combobox
                      id="latest-device"
                      value={device}
                      onChange={(v) => {
                        setDevice(v);
                        setSensor("");
                      }}
                      items={deviceItems}
                      placeholder="All devices…"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="latest-sensor">Sensor</Label>
                    <Combobox
                      id="latest-sensor"
                      value={sensor}
                      onChange={setSensor}
                      items={sensorItems}
                      placeholder="All sensors…"
                      disabled={rows.length === 0}
                    />
                  </div>
                  <div className="flex items-end justify-between gap-3">
                    <div className="space-y-1.5">
                      <Label>Only with value</Label>
                      <div className="flex items-center gap-2">
                        <Switch checked={onlyHasValue} onCheckedChange={setOnlyHasValue} />
                        <div className="text-xs text-zinc-600">
                          {filteredRows.length} / {rows.length}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <LatestDataTable
                  key={`${device}|${sensor}|${onlyHasValue ? "1" : "0"}`}
                  rows={filteredRows}
                  totalRows={rows.length}
                />
              </>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

