"use client";

import type { IoTDevice } from "@/types/iot";
import { Label } from "@/components/ui/label";
import { Combobox } from "@/components/ui/combobox";
import { useMemo } from "react";

export function DevicePicker({
  devices,
  value,
  onChange,
  disabled
}: {
  devices: IoTDevice[];
  value: string;
  onChange: (deviceId: string) => void;
  disabled?: boolean;
}) {
  const items = useMemo(() => {
    return [...devices]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((d) => ({ value: d.name, label: d.name }));
  }, [devices]);

  return (
    <div className="space-y-1.5">
      <Label htmlFor="device">Device</Label>
      <Combobox
        id="device"
        value={value}
        onChange={onChange}
        items={items}
        placeholder="Search devices…"
        disabled={disabled}
      />
    </div>
  );
}

