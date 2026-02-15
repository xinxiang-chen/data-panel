'use client'

import { useState } from 'react'
import { formatDateForDisplay } from '@/lib/dateUtils'

interface DataInspectorProps {
  data: any[]
}

const ITEMS_PER_PAGE = 10

export function DataInspector({ data }: DataInspectorProps) {
  const [currentPage, setCurrentPage] = useState(0)

  if (!data || data.length === 0) {
    return <div className="p-8 text-center text-gray-600">No data to display</div>
  }

  const totalPages = Math.ceil(data.length / ITEMS_PER_PAGE)
  const startIdx = currentPage * ITEMS_PER_PAGE
  const endIdx = startIdx + ITEMS_PER_PAGE
  const paginatedData = data.slice(startIdx, endIdx)

  const handleExportCSV = () => {
    const headers = ['Timestamp', 'Value', 'Raw Data']
    const rows = data.map((point: any) => [
      formatDateForDisplay(point.startTime || point.timestamp),
      point.value || point.avg || 'N/A',
      JSON.stringify(point),
    ])

    const csvContent = [
      headers.join(','),
      ...rows.map((row: any[]) => row.map((cell: any) => `"${cell}"`).join(',')),
    ].join('\n')

    const blob = new Blob([csvContent], { type: 'text/csv' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `sensor-data-${new Date().toISOString()}.csv`
    a.click()
  }

  return (
    <div className="bg-white p-8 rounded-lg shadow-md">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Data Table</h2>
        <button
          onClick={handleExportCSV}
          className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition"
        >
          Export to CSV
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-gray-100 border-b-2 border-gray-300">
              <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Timestamp</th>
              <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Value</th>
              <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Details</th>
            </tr>
          </thead>
          <tbody>
            {paginatedData.map((point: any, idx: number) => (
              <tr key={idx} className="border-b border-gray-200 hover:bg-gray-50">
                <td className="px-6 py-3 text-sm text-gray-900">
                  {formatDateForDisplay(point.startTime || point.timestamp)}
                </td>
                <td className="px-6 py-3 text-sm text-gray-900 font-semibold">
                  {point.value || point.avg || 'N/A'}
                </td>
                <td className="px-6 py-3 text-sm text-gray-600">
                  <code className="text-xs bg-gray-100 px-2 py-1 rounded">
                    {JSON.stringify(point).substring(0, 50)}...
                  </code>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="mt-6 flex items-center justify-between">
        <p className="text-sm text-gray-600">
          Showing {startIdx + 1} to {Math.min(endIdx, data.length)} of {data.length} records
        </p>
        <div className="flex gap-2">
          <button
            onClick={() => setCurrentPage(Math.max(0, currentPage - 1))}
            disabled={currentPage === 0}
            className="px-4 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Previous
          </button>
          <span className="px-4 py-2 text-gray-700">
            Page {currentPage + 1} of {totalPages}
          </span>
          <button
            onClick={() => setCurrentPage(Math.min(totalPages - 1, currentPage + 1))}
            disabled={currentPage === totalPages - 1}
            className="px-4 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  )
}
