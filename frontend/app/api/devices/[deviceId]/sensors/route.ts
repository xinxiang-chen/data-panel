import { NextResponse } from "next/server";
import { getSensors, shouldUseMock } from "@/lib/server/iot";
import { mockGetSensors } from "@/lib/server/mock";

export async function GET(_req: Request, ctx: { params: Promise<{ deviceId: string }> }) {
  const { deviceId } = await ctx.params;
  const useMock = shouldUseMock();

  if (useMock) {
    const sensors = mockGetSensors(deviceId);
    console.log("[api/sensors] fetched:", sensors.length, `deviceId=${deviceId}`, "source=mock");
    return NextResponse.json({ source: "mock" as const, deviceId, sensors });
  }

  try {
    const sensors = await getSensors(deviceId);
    console.log("[api/sensors] fetched:", sensors.length, `deviceId=${deviceId}`, "source=api");
    return NextResponse.json({ source: "api" as const, deviceId, sensors });
  } catch (e) {
    const sensors = mockGetSensors(deviceId);
    console.log("[api/sensors] fetched:", sensors.length, `deviceId=${deviceId}`, "source=mock (fallback)");
    return NextResponse.json({ source: "mock" as const, deviceId, sensors }, { status: 200 });
  }
}

