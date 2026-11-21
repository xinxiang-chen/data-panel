#!/usr/bin/env node

/**
 * Clean raw devices JSON to a compact structure:
 * [
 *   {
 *     "device_name": "...",
 *     "sensors": [
 *       { "sensor_name": "...", "descprtion": "..." }
 *     ]
 *   }
 * ]
 *
 * Usage:
 *   node scripts/clean-devices-json.js
 *   node scripts/clean-devices-json.js <inputPath> <outputPath>
 */

const fs = require('fs')
const path = require('path')

const defaultInput = path.join(
  __dirname,
  'json',
  'devices-2026-02-15T17-38-18-610Z.json'
)
const defaultOutput = path.join(
  __dirname,
  'json',
  'devices-2026-02-15T17-38-18-610Z.cleaned.json'
)

const inputPath = process.argv[2] ? path.resolve(process.argv[2]) : defaultInput
const outputPath = process.argv[3] ? path.resolve(process.argv[3]) : defaultOutput

function cleanDevices(rawDevices) {
  if (!Array.isArray(rawDevices)) {
    throw new Error('Input JSON must be an array of devices.')
  }

  return rawDevices.map((device) => {
    const sensorsRaw = Array.isArray(device?.sensors) ? device.sensors : []

    const sensors = sensorsRaw.map((sensor) => ({
      sensor_name: sensor?.name ?? '',
      // Keeping the key spelling requested by user: "descprtion"
      descprtion: sensor?.attributes?.description?.text ?? '',
    }))

    return {
      device_name: device?.name ?? '',
      sensors,
    }
  })
}

function main() {
  const content = fs.readFileSync(inputPath, 'utf8')
  const parsed = JSON.parse(content)
  const cleaned = cleanDevices(parsed)

  fs.writeFileSync(outputPath, JSON.stringify(cleaned, null, 2), 'utf8')
  console.log(`Cleaned JSON written to: ${outputPath}`)
  console.log(`Total devices: ${cleaned.length}`)
}

try {
  main()
} catch (error) {
  console.error('Failed to clean devices JSON:')
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}
