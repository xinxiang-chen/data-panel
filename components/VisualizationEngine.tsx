'use client'

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { formatDateForDisplay } from '@/lib/dateUtils'

interface VisualizationEngineProps {
  data: any[]
  sensorId: string | null
}

export function VisualizationEngine({ data, sensorId }: VisualizationEngineProps) {
  if (!data || data.length === 0) {
    return <div className="p-8 text-center text-gray-600">No data to display</div>
  }

  // Transform data for Recharts
  const chartData = data.map((point: any) => {
    const timestamp = point.startTime || point.timestamp
    return {
      timestamp: formatDateForDisplay(timestamp),
      value: point.value || point.avg || 0,
      raw: point,
    }
  })

  return (
    <div className="bg-white p-8 rounded-lg shadow-md">
      <h2 className="text-2xl font-bold text-gray-900 mb-6">Sensor Data Visualization</h2>
      
      <ResponsiveContainer width="100%" height={400}>
        <LineChart data={chartData} margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis 
            dataKey="timestamp" 
            angle={-45}
            textAnchor="end"
            height={100}
          />
          <YAxis />
          <Tooltip 
            content={({ active, payload }) => {
              if (active && payload && payload.length) {
                return (
                  <div className="bg-white p-3 border border-gray-300 rounded shadow">
                    <p className="text-sm font-semibold">{payload[0].payload.timestamp}</p>
                    <p className="text-sm text-blue-600">Value: {payload[0].value}</p>
                  </div>
                )
              }
              return null
            }}
          />
          <Legend />
          <Line 
            type="monotone" 
            dataKey="value" 
            stroke="#2563eb" 
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>

      <div className="mt-6 p-4 bg-gray-50 rounded border border-gray-200">
        <p className="text-sm text-gray-600">
          Total Data Points: <span className="font-semibold">{data.length}</span>
        </p>
      </div>
    </div>
  )
}
