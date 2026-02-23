#!/usr/bin/env node

/**
 * Extract device names from raw devices JSON.
 *
 * Input shape (example): [{ "name": "GCS_AHU1", ... }, ...]
 * Output shape: ["GCS_AHU1", "GCS_AHU2", ...]
 *
 * Usage:
 *   node scripts/extract-device-names.js
 *   node scripts/extract-device-names.js <inputPath> <outputPath>
 */

const fs = require("fs");
const path = require("path");

const defaultInput = path.join(__dirname, "json", "devices-2026-02-15T17-38-18-610Z.json");
const defaultOutput = path.join(__dirname, "json", "devices-2026-02-15T17-38-18-610Z.names.json");

const inputPath = process.argv[2] ? path.resolve(process.argv[2]) : defaultInput;
const outputPath = process.argv[3] ? path.resolve(process.argv[3]) : defaultOutput;

function extractNames(rawDevices) {
  if (!Array.isArray(rawDevices)) {
    throw new Error("Input JSON must be an array of devices.");
  }

  const names = [];
  for (const d of rawDevices) {
    const name = d?.name;
    if (typeof name === "string" && name.trim().length) names.push(name.trim());
  }

  return Array.from(new Set(names)).sort((a, b) => a.localeCompare(b));
}

function main() {
  const content = fs.readFileSync(inputPath, "utf8");
  const parsed = JSON.parse(content);
  const names = extractNames(parsed);

  fs.writeFileSync(outputPath, JSON.stringify(names, null, 2), "utf8");
  console.log(`Device names written to: ${outputPath}`);
  console.log(`Total devices: ${names.length}`);
}

try {
  main();
} catch (error) {
  console.error("Failed to extract device names:");
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

