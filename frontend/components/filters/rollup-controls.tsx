"use client";

import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

const INTERVALS = ["1h", "2h", "3h", "4h", "6h", "8h", "12h", "24h"] as const;

export function RollupControls({
  enabled,
  interval,
  onChangeEnabled,
  onChangeInterval,
  suggestedInterval
}: {
  enabled: boolean;
  interval: string;
  onChangeEnabled: (enabled: boolean) => void;
  onChangeInterval: (interval: string) => void;
  suggestedInterval?: string;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label>Roll-up</Label>
        <Switch checked={enabled} onCheckedChange={onChangeEnabled} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="interval">Interval {suggestedInterval ? `(suggested: ${suggestedInterval})` : ""}</Label>
        <Select
          id="interval"
          value={interval}
          onChange={(e) => onChangeInterval(e.target.value)}
          disabled={!enabled}
        >
          {INTERVALS.map((i) => (
            <option key={i} value={i}>
              {i}
            </option>
          ))}
          {suggestedInterval && !INTERVALS.includes(suggestedInterval as any) ? (
            <option value={suggestedInterval}>{suggestedInterval}</option>
          ) : null}
        </Select>
      </div>
    </div>
  );
}

