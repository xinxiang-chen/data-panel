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
  const [deviceSearchOpen, setDeviceSearchOpen] = useState(false)
  const [deviceSearchTerm, setDeviceSearchTerm] = useState('')
  const [highlightedIndex, setHighlightedIndex] = useState(-1)
  const [localSelectedDevice, setLocalSelectedDevice] = useState<string | null>(selectedDevice)

  // Load devices on mount
  useEffect(() => {
    const loadDevices = async () => {
      try {
        const data = await fetchSensorData('getAllDevices', {})
        // Sort devices alphabetically by name
        const sortedDevices = data.sort((a: any, b: any) => a.name.localeCompare(b.name))
        setDevices(sortedDevices)
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

  // Filter devices based on search term
  const filteredDevices = devices.filter((device: any) =>
    device.name.toLowerCase().includes(deviceSearchTerm.toLowerCase())
  )

  // Keep a local selected device in sync with prop so UI updates immediately
  useEffect(() => {
    setLocalSelectedDevice(selectedDevice)
  }, [selectedDevice])

  // Get selected device name (prefer local state)
  const selectedDeviceName = devices.find((d: any) => d.id === localSelectedDevice)?.name || ''

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!deviceSearchOpen && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      e.preventDefault()
      setDeviceSearchOpen(true)
      setHighlightedIndex(0)
      return
    }

    if (!deviceSearchOpen) return

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setHighlightedIndex((prev) =>
          prev < filteredDevices.length - 1 ? prev + 1 : prev
        )
        break
      case 'ArrowUp':
        e.preventDefault()
        setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : -1))
        break
      case 'Enter':
        e.preventDefault()
        if (highlightedIndex === -1) {
          // Clear selection
          setLocalSelectedDevice('')
          onDeviceChange('')
          onSensorChange('')
        } else if (highlightedIndex < filteredDevices.length) {
          const selectedDevice = filteredDevices[highlightedIndex]
          setLocalSelectedDevice(selectedDevice.id)
          onDeviceChange(selectedDevice.id)
          onSensorChange('')
        }
        setDeviceSearchOpen(false)
        setDeviceSearchTerm('')
        setHighlightedIndex(-1)
        break
      case 'Escape':
        e.preventDefault()
        setDeviceSearchOpen(false)
        setHighlightedIndex(-1)
        break
      default:
        break
    }
  }

  // Reset highlighted index when search term changes
  useEffect(() => {
    setHighlightedIndex(-1)
  }, [deviceSearchTerm])

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
      <div className="mb-6 relative">
        <label className="block text-sm font-semibold text-gray-700 mb-2">
          Device
        </label>
        {devicesLoading ? (
          <p className="text-gray-500 text-sm">Loading devices...</p>
        ) : (
          <div className="relative">
            {/* Search Input */}
            <div
              className="w-full px-4 py-2 border border-gray-300 rounded-lg cursor-pointer flex justify-between items-center bg-white hover:bg-gray-50 focus-within:ring-2 focus-within:ring-blue-500"
              onClick={() => setDeviceSearchOpen(!deviceSearchOpen)}
            >
              <input
                type="text"
                placeholder={selectedDevice ? selectedDeviceName : 'Search devices... (Arrow keys to navigate, Enter to select)'}
                value={deviceSearchOpen ? deviceSearchTerm : ''}
                onChange={(e) => setDeviceSearchTerm(e.target.value)}
                onKeyDown={handleKeyDown}
                className="w-full outline-none bg-transparent text-sm"
                onClick={(e) => {
                  e.stopPropagation()
                  setDeviceSearchOpen(true)
                }}
              />
              <span className="text-gray-400">▼</span>
            </div>

            {/* Dropdown Options */}
            {deviceSearchOpen && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-300 rounded-lg shadow-lg z-50 max-h-60 overflow-y-auto">
                {/* Clear selection option */}
                <div
                  className={`px-4 py-2 cursor-pointer text-sm transition ${
                    highlightedIndex === -1
                      ? 'bg-blue-100 text-blue-900'
                      : 'hover:bg-gray-100 text-gray-600'
                  }`}
                  onClick={() => {
                    setLocalSelectedDevice('')
                    onDeviceChange('')
                    onSensorChange('')
                    setDeviceSearchOpen(false)
                    setDeviceSearchTerm('')
                    setHighlightedIndex(-1)
                  }}
                  onMouseEnter={() => setHighlightedIndex(-1)}
                >
                  Clear selection
                </div>

                {/* Device options */}
                {filteredDevices.length > 0 ? (
                  filteredDevices.map((device: any, index: number) => (
                    <div
                      key={device.id}
                      className={`px-4 py-2 cursor-pointer text-sm transition ${
                        highlightedIndex === index
                          ? 'bg-blue-500 text-white'
                          : localSelectedDevice === device.id
                          ? 'bg-blue-100 text-blue-900'
                          : 'hover:bg-gray-100'
                      }`}
                      onClick={() => {
                        setLocalSelectedDevice(device.id)
                        onDeviceChange(device.id)
                        onSensorChange('')
                        setDeviceSearchOpen(false)
                        setDeviceSearchTerm('')
                        setHighlightedIndex(-1)
                      }}
                      onMouseEnter={() => setHighlightedIndex(index)}
                    >
                      {device.name}
                    </div>
                  ))
                ) : (
                  <div className="px-4 py-2 text-gray-500 text-sm">No devices found</div>
                )}
              </div>
            )}
          </div>
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
