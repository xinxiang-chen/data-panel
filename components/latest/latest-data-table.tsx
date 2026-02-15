"use client";

import type { LatestDataRow } from "@/types/iot";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  useReactTable
} from "@tanstack/react-table";
import { useMemo, useState } from "react";

function display(v: unknown) {
  if (v === null || v === undefined || v === "") return "N/A";
  return String(v);
}

const DATE_FMT = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "2-digit",
  year: "numeric"
});

const TIME_FMT = new Intl.DateTimeFormat("en-US", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: true,
  timeZoneName: "short"
});

function displayTime(iso: unknown) {
  if (iso === null || iso === undefined || iso === "") return "N/A";
  const ms = Date.parse(String(iso));
  if (!Number.isFinite(ms)) return "N/A";
  const d = new Date(ms);
  return `${DATE_FMT.format(d)} at ${TIME_FMT.format(d)}`;
}

function colClass(id: string) {
  // Width is controlled via <colgroup> so the table can fill its container
  // while keeping fixed column sizes.
  return "";
}

function cellTextClass(id: string) {
  if (id === "description") return "whitespace-normal break-words";
  if (id === "latestValue") return "whitespace-nowrap tabular-nums text-left";
  return "whitespace-nowrap";
}

function unitFromDescription(desc: unknown): string | undefined {
  if (desc === null || desc === undefined) return undefined;
  const s = String(desc);
  const parts = s
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  const unit = parts.at(-1);
  return unit && unit !== s ? unit : unit; // keep whatever last token is if present
}

function displayLatestValue(row: LatestDataRow) {
  const v = display(row.latestValue);
  if (v === "N/A") return v;
  const unit = unitFromDescription(row.description);
  return unit ? `${v} ${unit}` : v;
}

export function LatestDataTable({ rows, totalRows }: { rows: LatestDataRow[]; totalRows?: number }) {
  const [pageSize, setPageSize] = useState(100);

  const columns = useMemo<ColumnDef<LatestDataRow>[]>(
    () => [
      { accessorKey: "device", header: "Device", cell: (info) => display(info.getValue()) },
      { accessorKey: "sensor", header: "Sensor", cell: (info) => display(info.getValue()) },
      { accessorKey: "description", header: "Description", cell: (info) => display(info.getValue()) },
      {
        accessorKey: "latestValue",
        header: "Latest Value",
        cell: (info) => displayLatestValue(info.row.original)
      },
      { accessorKey: "timestamp", header: "Timestamp", cell: (info) => displayTime(info.getValue()) },
      { accessorKey: "queriedAt", header: "Queried At", cell: (info) => displayTime(info.getValue()) }
    ],
    []
  );

  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: rows,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 100 } }
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="text-xs text-zinc-600">
          {rows.length} rows{typeof totalRows === "number" ? ` (filtered from ${totalRows})` : ""}
        </div>
        <div className="flex items-end gap-3">
          <div className="flex items-center gap-2">
            <Label className="whitespace-nowrap">Max records</Label>
            <Select
              value={String(pageSize)}
              onChange={(e) => {
                const n = Number(e.target.value);
                setPageSize(n);
                table.setPageSize(n);
                table.setPageIndex(0);
              }}
              className="h-8 w-[120px] px-2 text-xs"
            >
              {[50, 100, 200, 500, 1000].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </Select>
          </div>
          <Button variant="ghost" size="sm" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}>
            Prev
          </Button>
          <Button variant="ghost" size="sm" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>
            Next
          </Button>
        </div>
      </div>

      <div className="overflow-auto rounded-md border border-zinc-200 bg-white">
        <table className="w-full table-fixed text-left text-sm">
          <colgroup>
            <col style={{ width: "8rem" }} /> {/* Device */}
            <col style={{ width: "16rem" }} /> {/* Sensor */}
            <col /> {/* Description (fills remaining space) */}
            <col style={{ width: "10rem" }} /> {/* Latest Value */}
            <col style={{ width: "13rem" }} /> {/* Timestamp */}
            <col style={{ width: "13rem" }} /> {/* Queried At */}
          </colgroup>
          <thead className="sticky top-0 bg-zinc-50">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((h) => (
                  <th
                    key={h.id}
                    className={[
                      "border-b border-zinc-200 px-3 py-2 text-xs font-semibold",
                      cellTextClass(String(h.column.id))
                    ].join(" ")}
                  >
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
                  <td
                    key={c.id}
                    className={[
                      "border-b border-zinc-100 px-3 py-2 text-xs align-top",
                      cellTextClass(String(c.column.id))
                    ].join(" ")}
                  >
                    {flexRender(c.column.columnDef.cell, c.getContext())}
                  </td>
                ))}
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td className="px-3 py-8 text-center text-xs text-zinc-500" colSpan={columns.length}>
                  No data
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="text-xs text-zinc-600">
        Page {table.getState().pagination.pageIndex + 1} / {table.getPageCount() || 1}
      </div>
    </div>
  );
}

