export type IoTDevice = {
  name: string;
  attributes?: {
    displayName?: { text?: string };
    description?: { text?: string };
  };
  sensors?: IoTSensor[];
};

export type IoTSensor = {
  nodeId?: string;
  name: string;
  attributes?: {
    displayName?: { text?: string };
    description?: { text?: string };
  };
  latestValue?: string | number | null;
  latestTimestamp?: string | null;
  latestQuality?: string | null;
  latestQueryTimestamp?: string | null;
};

export type IoTRawPoint = {
  value: string | number | null;
  quality?: string | null;
  timestamp: string;
  queryTimestamp?: string;
};

// Shape may vary by server; keep it flexible but typed.
export type IoTRollupPoint = {
  startTime: string;
  endTime?: string;
  min?: string | number | null;
  max?: string | number | null;
  avg?: string | number | null;
  sum?: string | number | null;
  count?: number | null;
};

export type SensorDataResponse =
  | {
      mode: "raw";
      deviceId: string;
      sensorId: string;
      startDate: string;
      endDate: string;
      points: IoTRawPoint[];
      suggestedInterval?: string;
      source: "api" | "mock";
    }
  | {
      mode: "rollup";
      deviceId: string;
      sensorId: string;
      startDate: string;
      endDate: string;
      interval: string;
      points: IoTRollupPoint[];
      suggestedInterval?: string;
      source: "api" | "mock";
    };

export type LatestDataRow = {
  device: string;
  sensor: string;
  description: string | null;
  latestValue: string | number | null;
  timestamp: string | null;
  queriedAt: string | null;
};

export type LatestDataResponse = {
  source: "api" | "mock";
  rows: LatestDataRow[];
};

