'use client'

import { useState } from 'react'
import { ConfigurationSidebar } from './ConfigurationSidebar'
import { VisualizationEngine } from './VisualizationEngine'
import { DataInspector } from './DataInspector'

export function Dashboard() {
  const [viewMode, setViewMode] = useState<'chart' | 'table'>('chart')
  const [selectedDevice, setSelectedDevice] = useState<string | null>(null)
  const [selectedSensor, setSelectedSensor] = useState<string | null>(null)
  const [dateRange, setDateRange] = useState<{ start: Date; end: Date } | null>(null)
  const [enableRollUp, setEnableRollUp] = useState(false)
  const [rollUpInterval, setRollUpInterval] = useState('1h')
  const [sensorData, setSensorData] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleDataFetch = (data: any[]) => {
    setSensorData(data)
    setError(null)
  }

  const handleError = (err: string) => {
    setError(err)
  }

  const handleLoadingChange = (loading: boolean) => {
    setIsLoading(loading)
  }

  return (
    <div className="flex h-screen bg-gray-100">
      {/* Sidebar */}
      <div className="w-80 bg-white shadow-lg">
        <ConfigurationSidebar
          selectedDevice={selectedDevice}
          selectedSensor={selectedSensor}
          dateRange={dateRange}
          enableRollUp={enableRollUp}
          rollUpInterval={rollUpInterval}
          onDeviceChange={setSelectedDevice}
          onSensorChange={setSelectedSensor}
          onDateRangeChange={setDateRange}
          onRollUpToggle={setEnableRollUp}
          onRollUpIntervalChange={setRollUpInterval}
          onFetch={handleDataFetch}
          onError={handleError}
          onLoadingChange={handleLoadingChange}
        />
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-auto">
        <div className="p-8">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-4xl font-bold text-gray-900">Data Panel</h1>
            <p className="text-gray-600 mt-2">IoT Sensor Data Visualization & Analysis</p>
          </div>

          {/* View Mode Toggle */}
          <div className="mb-6 flex gap-4">
            <button
              onClick={() => setViewMode('chart')}
              className={`px-6 py-2 rounded-lg font-semibold transition ${
                viewMode === 'chart'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-200 text-gray-800 hover:bg-gray-300'
              }`}
            >
              Chart View
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={`px-6 py-2 rounded-lg font-semibold transition ${
                viewMode === 'table'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-200 text-gray-800 hover:bg-gray-300'
              }`}
            >
              Table View
            </button>
          </div>

          {/* Loading & Error States */}
          {isLoading && (
            <div className="p-8 bg-blue-50 rounded-lg border border-blue-200">
              <p className="text-blue-800 font-semibold">Loading data...</p>
            </div>
          )}

          {error && (
            <div className="p-8 bg-red-50 rounded-lg border border-red-200">
              <p className="text-red-800 font-semibold">Error: {error}</p>
            </div>
          )}

          {/* Content */}
          {!isLoading && !error && sensorData.length > 0 && (
            <>
              {viewMode === 'chart' ? (
                <VisualizationEngine data={sensorData} sensorId={selectedSensor} />
              ) : (
                <DataInspector data={sensorData} />
              )}
            </>
          )}

          {!isLoading && !error && sensorData.length === 0 && (
            <div className="p-8 bg-gray-50 rounded-lg border border-gray-300 text-center">
              <p className="text-gray-600">Select a device and sensor to view data</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
