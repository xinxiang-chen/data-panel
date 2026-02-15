/**
 * IoT API Client
 * Handles all communication with the IoT backend API
 */

const BASE_URL = process.env.BASE_URL
const PROJECT_ID = process.env.PROJECT_ID
const API_TOKEN = process.env.API_TOKEN

const headers = {
  'Authorization': `Bearer ${API_TOKEN}`,
  'Content-Type': 'application/json',
}

/**
 * Get all devices for the project
 */
export async function getAllDevices() {
  const url = `${BASE_URL}/api/${PROJECT_ID}/devices`
  const response = await fetch(url, { headers })
  if (!response.ok) {
    throw new Error(`Failed to fetch devices: ${response.statusText}`)
  }
  return response.json()
}

/**
 * Get latest sensor data for a specific device
 */
export async function getLatestSensorData(deviceId: string) {
  const url = `${BASE_URL}/api/${PROJECT_ID}/devices/${deviceId}/sensors`
  const response = await fetch(url, { headers })
  if (!response.ok) {
    throw new Error(`Failed to fetch sensor data: ${response.statusText}`)
  }
  return response.json()
}

/**
 * Get sensor data within a date range
 */
export async function getSensorDataWithRange(
  deviceId: string,
  sensorId: string,
  startDate: string,
  endDate: string
) {
  const url = `${BASE_URL}/api/${PROJECT_ID}/devices/${deviceId}/sensors/${sensorId}/data`
  const params = new URLSearchParams({
    startDate,
    endDate,
  })

  const response = await fetch(`${url}?${params}`, { headers })
  if (!response.ok) {
    throw new Error(`Failed to fetch sensor data: ${response.statusText}`)
  }
  
  const data = await response.json()
  
  // Manual filtering to ensure data is within the requested range
  // getSensorDataWithRange uses 'timestamp' field
  const startD = new Date(startDate)
  const filteredData = data.filter((point: any) => {
    if (!point.timestamp) return false
    const pointTime = new Date(point.timestamp)
    return !isNaN(pointTime.getTime()) && pointTime >= startD
  })
  
  return filteredData
}

/**
 * Get roll-up (aggregated) data for a sensor
 */
export async function getRollUpData(
  deviceId: string,
  sensorId: string,
  interval: string,
  startDate: string,
  endDate: string,
  strictFilter: boolean = true
) {
  const url = `${BASE_URL}/api/${PROJECT_ID}/devices/${deviceId}/sensors/${sensorId}/rollups`
  const params = new URLSearchParams({
    interval,
    startDate,
    endDate,
    strictFilterToDates: strictFilter.toString().toLowerCase(),
  })

  const response = await fetch(`${url}?${params}`, { headers })
  if (!response.ok) {
    throw new Error(`Failed to fetch rollup data: ${response.statusText}`)
  }

  const data = await response.json()

  // Validate response is array
  if (!Array.isArray(data)) {
    throw new Error('Invalid rollup data format: expected array')
  }

  // Manual filtering to ensure data is within the requested range
  // getRollUpData uses 'startTime' field
  const startD = new Date(startDate)
  const filteredData = data.filter((point: any) => {
    if (!point.startTime) return false
    const pointTime = new Date(point.startTime)
    return !isNaN(pointTime.getTime()) && pointTime >= startD
  })

  return filteredData
}
