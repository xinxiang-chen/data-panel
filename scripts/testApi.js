#!/usr/bin/env node

/**
 * Simple API Tester Script (JavaScript)
 * Tests all API endpoints against the Next.js proxy server
 * 
 * Usage:
 *   node scripts/testApi.js
 * 
 * Make sure the dev server is running: npm run dev
 */

const fs = require('fs')
const path = require('path')

const BASE_API_URL = 'http://localhost:3000/api/sensors'
const JSON_OUTPUT_DIR = path.join(__dirname, 'json')
const results = []

// Ensure JSON output directory exists
if (!fs.existsSync(JSON_OUTPUT_DIR)) {
  fs.mkdirSync(JSON_OUTPUT_DIR, { recursive: true })
}

// Helper function to make API calls
async function callAPI(action, params) {
  const searchParams = new URLSearchParams()
  searchParams.append('action', action)

  Object.entries(params).forEach(([key, value]) => {
    searchParams.append(key, String(value))
  })

  const url = `${BASE_API_URL}?${searchParams.toString()}`
  console.log(`\n📤 Calling: ${url}`)

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    })

    const data = await response.json()

    return {
      ok: response.ok,
      status: response.status,
      data,
    }
  } catch (error) {
    return {
      ok: false,
      error: error.message || 'Unknown error',
    }
  }
}

// Test 1: Get All Devices
async function testGetAllDevices() {
  console.log('\n' + '='.repeat(60))
  console.log('TEST 1: Get All Devices')
  console.log('='.repeat(60))

  const result = await callAPI('getAllDevices', {})

  if (result.ok && Array.isArray(result.data)) {
    results.push({
      name: 'Get All Devices',
      status: 'PASS',
      message: `✅ Retrieved ${result.data.length} device(s)`,
    })
    
    // Write JSON output to file
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const filePath = path.join(JSON_OUTPUT_DIR, `devices-${timestamp}.json`)
    fs.writeFileSync(filePath, JSON.stringify(result.data, null, 2))
    console.log(`📁 JSON output saved to: ${filePath}`)
    
    console.log(`✅ Success! Found ${result.data.length} device(s)`)
    if (result.data.length > 0) {
      // console.log(`📋 First device:`, JSON.stringify(result.data[0], null, 2))
      return result.data[0]
    }
  } else if (result.error) {
    results.push({
      name: 'Get All Devices',
      status: 'FAIL',
      message: '❌ Request failed',
      error: result.error,
    })
    console.error('❌ Error:', result.error)
  } else {
    results.push({
      name: 'Get All Devices',
      status: 'FAIL',
      message: '❌ Unexpected response',
      error: `Status ${result.status}: ${result.data.error}`,
    })
    console.error('❌ Error:', result.data)
  }

  return null
}

// Test 2: Get Latest Sensor Data
async function testGetLatestSensorData(deviceId) {
  console.log('\n' + '='.repeat(60))
  console.log('TEST 2: Get Latest Sensor Data')
  console.log('='.repeat(60))

  const result = await callAPI('getLatestSensorData', { deviceId })

  if (result.ok && Array.isArray(result.data)) {
    results.push({
      name: 'Get Latest Sensor Data',
      status: 'PASS',
      message: `✅ Retrieved ${result.data.length} sensor(s)`,
    })
    
    // Write JSON output to file
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const filePath = path.join(JSON_OUTPUT_DIR, `sensors-${timestamp}.json`)
    fs.writeFileSync(filePath, JSON.stringify(result.data, null, 2))
    console.log(`📁 JSON output saved to: ${filePath}`)
    
    console.log(`✅ Success! Found ${result.data.length} sensor(s)`)
    if (result.data.length > 0) {
      console.log(`📋 First sensor:`, JSON.stringify(result.data[0], null, 2))
      return result.data[0]
    }
  } else if (result.error) {
    results.push({
      name: 'Get Latest Sensor Data',
      status: 'FAIL',
      message: '❌ Request failed',
      error: result.error,
    })
    console.error('❌ Error:', result.error)
  } else {
    results.push({
      name: 'Get Latest Sensor Data',
      status: 'FAIL',
      message: '❌ Unexpected response',
      error: `Status ${result.status}: ${result.data.error}`,
    })
    console.error('❌ Error:', result.data)
  }

  return null
}

// Test 3: Get Sensor Data With Range
async function testGetSensorDataWithRange(deviceId, sensorId, startDate, endDate) {
  console.log('\n' + '='.repeat(60))
  console.log('TEST 3: Get Sensor Data With Range')
  console.log('='.repeat(60))

  const result = await callAPI('getSensorDataWithRange', {
    deviceId,
    sensorId,
    startDate,
    endDate,
  })

  if (result.ok && Array.isArray(result.data)) {
    results.push({
      name: 'Get Sensor Data With Range',
      status: 'PASS',
      message: `✅ Retrieved ${result.data.length} data point(s)`,
    })
    
    // Write JSON output to file
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const filePath = path.join(JSON_OUTPUT_DIR, `sensor-data-${timestamp}.json`)
    fs.writeFileSync(filePath, JSON.stringify(result.data, null, 2))
    console.log(`📁 JSON output saved to: ${filePath}`)
    
    console.log(`✅ Success! Found ${result.data.length} data point(s)`)
    if (result.data.length > 0) {
      console.log(`📋 First data point:`, JSON.stringify(result.data[0], null, 2))
    }
  } else if (result.error) {
    results.push({
      name: 'Get Sensor Data With Range',
      status: 'FAIL',
      message: '❌ Request failed',
      error: result.error,
    })
    console.error('❌ Error:', result.error)
  } else {
    results.push({
      name: 'Get Sensor Data With Range',
      status: 'FAIL',
      message: '❌ Unexpected response',
      error: `Status ${result.status}: ${result.data.error}`,
    })
    console.error('❌ Error:', result.data)
  }
}

// Test 4: Get Rollup Data
async function testGetRollupData(deviceId, sensorId, interval, startDate, endDate) {
  console.log('\n' + '='.repeat(60))
  console.log('TEST 4: Get Rollup Data')
  console.log('='.repeat(60))

  const result = await callAPI('getRollUpData', {
    deviceId,
    sensorId,
    interval,
    startDate,
    endDate,
    strictFilter: true,
  })

  if (result.ok && Array.isArray(result.data)) {
    results.push({
      name: 'Get Rollup Data',
      status: 'PASS',
      message: `✅ Retrieved ${result.data.length} rollup point(s)`,
    })
    
    // Write JSON output to file
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const filePath = path.join(JSON_OUTPUT_DIR, `rollup-data-${timestamp}.json`)
    fs.writeFileSync(filePath, JSON.stringify(result.data, null, 2))
    console.log(`📁 JSON output saved to: ${filePath}`)
    
    console.log(`✅ Success! Found ${result.data.length} rollup point(s)`)
    if (result.data.length > 0) {
      console.log(`📋 First rollup point:`, JSON.stringify(result.data[0], null, 2))
    }
  } else if (result.error) {
    results.push({
      name: 'Get Rollup Data',
      status: 'FAIL',
      message: '❌ Request failed',
      error: result.error,
    })
    console.error('❌ Error:', result.error)
  } else {
    results.push({
      name: 'Get Rollup Data',
      status: 'FAIL',
      message: '❌ Unexpected response',
      error: `Status ${result.status}: ${result.data.error}`,
    })
    console.error('❌ Error:', result.data)
  }
}

// Test 5: Error handling - missing params
async function testErrorHandling() {
  console.log('\n' + '='.repeat(60))
  console.log('TEST 5: Error Handling (Missing Parameters)')
  console.log('='.repeat(60))

  const result = await callAPI('getSensorDataWithRange', {
    deviceId: 'test-device',
    // Missing sensorId, startDate, endDate
  })

  if (!result.ok && result.status === 400) {
    results.push({
      name: 'Error Handling - Missing Params',
      status: 'PASS',
      message: `✅ Correctly returned 400 error`,
    })
    console.log(`✅ Correctly caught error: ${result.data.error}`)
  } else {
    results.push({
      name: 'Error Handling - Missing Params',
      status: 'FAIL',
      message: '❌ Should return 400 error',
      error: `Expected 400, got ${result.status}`,
    })
    console.error('❌ Error:', result.data)
  }
}

// Print summary
function printSummary() {
  console.log('\n' + '='.repeat(60))
  console.log('TEST SUMMARY')
  console.log('='.repeat(60))

  const passed = results.filter((r) => r.status === 'PASS').length
  const failed = results.filter((r) => r.status === 'FAIL').length

  results.forEach((result) => {
    const icon = result.status === 'PASS' ? '✅' : '❌'
    console.log(`${icon} ${result.name}: ${result.message}`)
    if (result.error) {
      console.log(`   Error: ${result.error}`)
    }
  })

  console.log('\n' + '-'.repeat(60))
  console.log(`Total: ${results.length} | Passed: ${passed} | Failed: ${failed}`)
  console.log('='.repeat(60) + '\n')

  process.exit(failed > 0 ? 1 : 0)
}

// Helper to format dates
function formatDate(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  const seconds = String(date.getSeconds()).padStart(2, '0')
  const ms = String(date.getMilliseconds()).padStart(3, '0')

  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}.${ms}Z`
}

// Main test runner
async function runTests() {
  console.log('🚀 Starting API Tests...')
  console.log(`📍 Testing against: ${BASE_API_URL}`)
  console.log('⏱️  Make sure your dev server is running: npm run dev\n')

  try {
    // Test 1: Get devices
    // const device = await testGetAllDevices()

    // if (!device || !device.id) {
    //   console.error('❌ No devices found. Cannot continue with remaining tests.')
    //   printSummary()
    //   return
    // }

    const deviceId = "GCS_AHU5"

    // // Test 2: Get sensors for first device
    // const sensor = await testGetLatestSensorData(deviceId)

    // if (!sensor || !sensor.id) {
    //   console.error('❌ No sensors found. Cannot continue with remaining tests.')
    //   printSummary()
    //   return
    // }

    const sensorId = "GCS_AHU5DaRh"

    // Calculate date range (last 7 days)
    const endDate = new Date()
    const startDate = new Date(endDate.getTime() - 7 * 24 * 60 * 60 * 1000)

    const startDateStr = formatDate(startDate)
    const endDateStr = formatDate(endDate)

    console.log(`\n📅 Using date range: ${startDateStr} to ${endDateStr}`)

    // Test 3: Get sensor data with range
    await testGetSensorDataWithRange(deviceId, sensorId, startDateStr, endDateStr)

  //   // Test 4: Get rollup data
  //   await testGetRollupData(deviceId, sensorId, '1h', startDateStr, endDateStr)

  //   // Test 5: Error handling
  //   await testErrorHandling()

  //   printSummary()
  } catch (error) {
    console.error('❌ Test runner error:', error)
    printSummary()
  }
}

// Run tests
runTests()
