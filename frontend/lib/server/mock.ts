import type { IoTDevice, IoTRawPoint, IoTSensor } from "@/types/iot";

import devices from "@/data/mock/devices.json";
import devicesWithSensors from "@/data/mock/devices-with-sensors.json";
import sensors from "@/data/mock/sensors.json";
import sensorData from "@/data/mock/sensor-data.json";

export function mockGetDevices(): IoTDevice[] {
  return devices as IoTDevice[];
}

export function mockGetDevicesWithSensors(): IoTDevice[] {
  return devicesWithSensors as unknown as IoTDevice[];
}

export function mockGetSensors(_deviceId: string): IoTSensor[] {
  return sensors as IoTSensor[];
}

export function mockGetSensorData(): IoTRawPoint[] {
  return sensorData as IoTRawPoint[];
}

