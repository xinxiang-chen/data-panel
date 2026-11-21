import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export async function GET() {
  try {
    const filePath = join(process.cwd(), "data", "mock", "example_query", "example_queries.txt");
    const raw = await readFile(filePath, "utf8");
    const queries = raw
      .split(/\r?\n/g)
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith("#"));

    return NextResponse.json({ queries });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load example queries";
    return NextResponse.json({ queries: [], error: message }, { status: 200 });
  }
}

