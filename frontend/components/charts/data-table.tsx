"use client";

import type { IoTRawPoint, IoTRollupPoint } from "@/types/iot";
import { toNumberish } from "@/lib/sensor-logic";
import { Button } from "@/components/ui/button";
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  useReactTable
} from "@tanstack/react-table";
import { useMemo } from "react";

type Mode = "raw" | "rollup";

function downloadText(filename: string, text: string) {
  const blob = new Blob([text], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function toCsv(rows: Record<string, unknown>[]) {
  const headers = Array.from(
    rows.reduce((set, r) => {
      Object.keys(r).forEach((k) => set.add(k));
      return set;
    }, new Set<string>())
  );

  const esc = (v: unknown) => {
    const s = v == null ? "" : String(v);
    if (/[",\n]/.test(s)) return `"${s.replaceAll('"', '""')}"`;
    return s;
  };

  return [headers.join(","), ...rows.map((r) => headers.map((h) => esc(r[h])).join(","))].join("\n");
}

export function DataTable({ mode, points }: { mode: Mode; points: IoTRawPoint[] | IoTRollupPoint[] }) {
  const rows = useMemo(() => {
    if (mode === "raw") {
      return (points as IoTRawPoint[]).map((p) => ({
        timestamp: p.timestamp,
        value: toNumberish(p.value),
        quality: p.quality ?? ""
      }));
    }
    return (points as IoTRollupPoint[]).map((p: any) => ({
      startTime: p.startTime,
      endTime: p.endTime ?? "",
      avg: toNumberish(p.avg ?? p.mean ?? p.value),
      min: toNumberish(p.min),
      max: toNumberish(p.max),
      count: p.count ?? ""
    }));
  }, [mode, points]);

  const columns = useMemo<ColumnDef<(typeof rows)[number]>[]>(() => {
    const keys = rows[0] ? Object.keys(rows[0]) : [];
    return keys.map((k) => ({
      accessorKey: k,
      header: k,
      cell: (info) => String(info.getValue() ?? "")
    }));
  }, [rows]);

  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: rows,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 25 } }
  });

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex shrink-0 items-center justify-between gap-3">
        <div className="text-xs text-zinc-600">{rows.length} rows</div>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => downloadText("sensor-data.csv", toCsv(rows as any))}
          disabled={rows.length === 0}
        >
          Export CSV
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-auto rounded-md border border-zinc-200">
        <table className="min-w-full text-left text-sm">
          <thead className="sticky top-0 bg-zinc-50">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((h) => (
                  <th key={h.id} className="whitespace-nowrap border-b border-zinc-200 px-3 py-2 text-xs font-semibold">
                    {h.isPlaceholder ? null : flexRender(h.column.columnDef.header, h.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((r) => (
              <tr key={r.id} className="odd:bg-white even:bg-zinc-50/40">
                {r.getVisibleCells().map((c) => (
                  <td key={c.id} className="whitespace-nowrap border-b border-zinc-100 px-3 py-2 text-xs">
                    {flexRender(c.column.columnDef.cell, c.getContext())}
                  </td>
                ))}
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td className="px-3 py-8 text-center text-xs text-zinc-500" colSpan={columns.length || 1}>
                  No data
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="flex shrink-0 items-center justify-between">
        <div className="text-xs text-zinc-600">
          Page {table.getState().pagination.pageIndex + 1} / {table.getPageCount() || 1}
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}>
            Prev
          </Button>
          <Button variant="ghost" size="sm" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}

