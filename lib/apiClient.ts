/**
 * API client hook for frontend data fetching
 * Uses the Next.js proxy API routes
 */

export async function fetchSensorData(
  action: string,
  params: Record<string, string | boolean>
): Promise<any> {
  const searchParams = new URLSearchParams()
  searchParams.append('action', action)

  Object.entries(params).forEach(([key, value]) => {
    searchParams.append(key, String(value))
  })

  const response = await fetch(`/api/sensors?${searchParams}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to fetch data')
  }

  return response.json()
}
