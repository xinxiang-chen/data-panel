import { NextResponse } from "next/server";
import { getDevices, shouldUseMock } from "@/lib/server/iot";
import { mockGetDevices } from "@/lib/server/mock";

export async function GET() {
  const useMock = shouldUseMock();
  if (useMock) {
    const devices = mockGetDevices();
    console.log("[api/devices] fetched:", devices.length, "source=mock");
    return NextResponse.json({ source: "mock" as const, devices });
  }

  try {
    const devices = await getDevices();
    console.log("[api/devices] fetched:", devices.length, "source=api");
    return NextResponse.json({ source: "api" as const, devices });
  } catch (e) {
    // Demo-friendly fallback if upstream is down.
    const devices = mockGetDevices();
    console.log("[api/devices] fetched:", devices.length, "source=mock (fallback)");
    return NextResponse.json({ source: "mock" as const, devices }, { status: 200 });
  }
}

