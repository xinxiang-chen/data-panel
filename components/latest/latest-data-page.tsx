"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { apiGetLatestData } from "@/lib/client/iot-api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LatestDataTable } from "@/components/latest/latest-data-table";

export function LatestDataPage() {
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

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50">
      <header className="shrink-0 border-b border-zinc-200 bg-white">
        <div className="mx-auto flex w-full max-w-screen-2xl items-center justify-between px-2 py-2 sm:px-3 lg:px-4">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-md bg-zinc-900" />
            <div className="text-sm font-semibold">Latest Data</div>
            <nav className="ml-3 flex items-center gap-3 text-xs text-zinc-600">
              <Link className="hover:text-zinc-900" href="/">
                Dashboard
              </Link>
              <span className="text-zinc-300">/</span>
              <span className="font-medium text-zinc-900">Latest</span>
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
              <LatestDataTable rows={q.data?.rows ?? []} />
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

