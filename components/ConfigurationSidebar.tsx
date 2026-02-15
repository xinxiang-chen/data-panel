'use client'

import { useEffect, useState } from 'react'
import { fetchSensorData } from '@/lib/apiClient'
import { formatDateForAPI } from '@/lib/dateUtils'

interface ConfigurationSidebarProps {
  selectedDevice: string | null
  selectedSensor: string | null
  dateRange: { start: Date; end: Date } | null
  enableRollUp: boolean
  rollUpInterval: string
  onDeviceChange: (deviceId: string) => void
  onSensorChange: (sensorId: string) => void
  onDateRangeChange: (range: { start: Date; end: Date } | null) => void
  onRollUpToggle: (enabled: boolean) => void
  onRollUpIntervalChange: (interval: string) => void
  onFetch: (data: any[]) => void
  onError: (error: string) => void
  onLoadingChange: (loading: boolean) => void
}

export function ConfigurationSidebar({
  selectedDevice,
  selectedSensor,
  dateRange,
  enableRollUp,
  rollUpInterval,
  onDeviceChange,
  onSensorChange,
  onDateRangeChange,
  onRollUpToggle,
  onRollUpIntervalChange,
  onFetch,
  onError,
  onLoadingChange,
}: ConfigurationSidebarProps) {
  const [devices, setDevices] = useState<any[]>([])
  const [sensors, setSensors] = useState<any[]>([])
  const [devicesLoading, setDevicesLoading] = useState(true)

  // Load devices on mount
  useEffect(() => {
    const loadDevices = async () => {
      try {
        const data = await fetchSensorData('getAllDevices', {})
        setDevices(data)
      } catch (err) {
        onError('Failed to load devices')
      } finally {
        setDevicesLoading(false)
      }
    }
    loadDevices()
  }, [onError])

  // Load sensors when device changes
  useEffect(() => {
    if (!selectedDevice) {
      setSensors([])
      return
    }

    const loadSensors = async () => {
      try {
        const data = await fetchSensorData('getLatestSensorData', {
          deviceId: selectedDevice,
        })
        setSensors(data)
      } catch (err) {
        onError('Failed to load sensors')
      }
    }
    loadSensors()
  }, [selectedDevice, onError])

  // Fetch data when parameters change
  const handleFetchData = async () => {
    if (!selectedDevice || !selectedSensor || !dateRange) {
      onError('Please select device, sensor, and date range')
      return
    }

    onLoadingChange(true)
    try {
      let data
      if (enableRollUp) {
        data = await fetchSensorData('getRollUpData', {
          deviceId: selectedDevice,
          sensorId: selectedSensor,
          interval: rollUpInterval,
          startDate: formatDateForAPI(dateRange.start),
          endDate: formatDateForAPI(dateRange.end),
          strictFilter: true,
        })
      } else {
        data = await fetchSensorData('getSensorDataWithRange', {
          deviceId: selectedDevice,
          sensorId: selectedSensor,
          startDate: formatDateForAPI(dateRange.start),
          endDate: formatDateForAPI(dateRange.end),
        })
      }
      onFetch(data)
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to fetch data')
    } finally {
      onLoadingChange(false)
    }
  }

  return (
    <div className="p-6 h-full flex flex-col overflow-y-auto">
      <h2 className="text-2xl font-bold text-gray-900 mb-6">Configuration</h2>

      {/* Device Selection */}
      <div className="mb-6">
        <label className="block text-sm font-semibold text-gray-700 mb-2">
          Device
        </label>
        {devicesLoading ? (
          <p className="text-gray-500 text-sm">Loading devices...</p>
        ) : (
          <select
            value={selectedDevice || ''}
            onChange={(e) => {
              onDeviceChange(e.target.value)
              onSensorChange('')
            }}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="">Select a device</option>
            {devices.map((device: any) => (
              <option key={device.id} value={device.id}>
                {device.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Sensor Selection */}
      <div className="mb-6">
        <label className="block text-sm font-semibold text-gray-700 mb-2">
          Sensor
        </label>
        <select
          value={selectedSensor || ''}
          onChange={(e) => onSensorChange(e.target.value)}
          disabled={!selectedDevice}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100"
        >
          <option value="">Select a sensor</option>
          {sensors.map((sensor: any) => (
            <option key={sensor.id} value={sensor.id}>
              {sensor.name}
            </option>
          ))}
        </select>
      </div>

      {/* Date Range */}
      <div className="mb-6">
        <label className="block text-sm font-semibold text-gray-700 mb-2">
          Start Date
        </label>
        <input
          type="datetime-local"
          value={dateRange?.start ? dateRange.start.toISOString().slice(0, 16) : ''}
          onChange={(e) => {
            if (e.target.value) {
              const start = new Date(e.target.value)
              onDateRangeChange({
                start,
                end: dateRange?.end || new Date(),
              })
            }
          }}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </div>

      <div className="mb-6">
        <label className="block text-sm font-semibold text-gray-700 mb-2">
          End Date
        </label>
        <input
          type="datetime-local"
          value={dateRange?.end ? dateRange.end.toISOString().slice(0, 16) : ''}
          onChange={(e) => {
            if (e.target.value) {
              const end = new Date(e.target.value)
              onDateRangeChange({
                start: dateRange?.start || new Date(),
                end,
              })
            }
          }}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </div>

      {/* Roll-up Toggle */}
      <div className="mb-6">
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={enableRollUp}
            onChange={(e) => onRollUpToggle(e.target.checked)}
            className="w-4 h-4"
          />
          <span className="text-sm font-semibold text-gray-700">Enable Roll-up Data</span>
        </label>
      </div>

      {/* Roll-up Interval */}
      {enableRollUp && (
        <div className="mb-6">
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            Roll-up Interval
          </label>
          <select
            value={rollUpInterval}
            onChange={(e) => onRollUpIntervalChange(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="1m">1 Minute</option>
            <option value="5m">5 Minutes</option>
            <option value="15m">15 Minutes</option>
            <option value="1h">1 Hour</option>
            <option value="1d">1 Day</option>
          </select>
        </div>
      )}

      {/* Fetch Button */}
      <button
        onClick={handleFetchData}
        className="w-full bg-blue-600 text-white font-semibold py-3 rounded-lg hover:bg-blue-700 transition mt-auto"
      >
        Fetch Data
      </button>
    </div>
  )
}
