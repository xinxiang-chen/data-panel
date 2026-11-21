"use client";

import type { IoTSensor } from "@/types/iot";
import { Label } from "@/components/ui/label";
import { Combobox } from "@/components/ui/combobox";
import { useMemo } from "react";

function sensorLabel(s: IoTSensor) {
  const desc = s.attributes?.description?.text;
  return desc ? `${s.name} — ${desc}` : s.name;
}

export function SensorPicker({
  sensors,
  value,
  onChange,
  disabled
}: {
  sensors: IoTSensor[];
  value: string;
  onChange: (sensorId: string) => void;
  disabled?: boolean;
}) {
  const items = useMemo(() => {
    return [...sensors]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((s) => ({ value: s.name, label: sensorLabel(s), keywords: s.attributes?.description?.text ?? "" }));
  }, [sensors]);

  return (
    <div className="space-y-1.5">
      <Label htmlFor="sensor">Sensor</Label>
      <Combobox
        id="sensor"
        value={value}
        onChange={onChange}
        items={items}
        placeholder="Search sensors…"
        disabled={disabled}
      />
    </div>
  );
}

