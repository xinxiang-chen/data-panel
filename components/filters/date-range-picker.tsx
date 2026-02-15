"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

export function DateRangePicker({
  start,
  end,
  onChangeStart,
  onChangeEnd,
  onQuickRangeDays
}: {
  start: string;
  end: string;
  onChangeStart: (v: string) => void;
  onChangeEnd: (v: string) => void;
  onQuickRangeDays?: (days: number) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="start">Start (local)</Label>
          {onQuickRangeDays ? (
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 whitespace-nowrap px-2 text-[11px]"
                onClick={() => onQuickRangeDays(1)}
              >
                Last 24h
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 whitespace-nowrap px-2 text-[11px]"
                onClick={() => onQuickRangeDays(7)}
              >
                Last 7 days
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 whitespace-nowrap px-2 text-[11px]"
                onClick={() => onQuickRangeDays(30)}
              >
                Last 30 days
              </Button>
            </div>
          ) : null}
        </div>
        <Input id="start" type="datetime-local" value={start} onChange={(e) => onChangeStart(e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="end">End (local)</Label>
        <Input id="end" type="datetime-local" value={end} onChange={(e) => onChangeEnd(e.target.value)} />
      </div>
    </div>
  );
}

