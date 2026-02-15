import { NextRequest, NextResponse } from 'next/server'
import { 
  getAllDevices, 
  getLatestSensorData, 
  getSensorDataWithRange,
  getRollUpData 
} from '@/lib/iotApi'

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const action = searchParams.get('action')

    switch (action) {
      case 'getAllDevices':
        const devices = await getAllDevices()
        return NextResponse.json(devices)

      case 'getLatestSensorData': {
        const deviceId = searchParams.get('deviceId')
        if (!deviceId) {
          return NextResponse.json({ error: 'deviceId is required' }, { status: 400 })
        }
        const sensorData = await getLatestSensorData(deviceId)
        return NextResponse.json(sensorData)
      }

      case 'getSensorDataWithRange': {
        const deviceId = searchParams.get('deviceId')
        const sensorId = searchParams.get('sensorId')
        const startDate = searchParams.get('startDate')
        const endDate = searchParams.get('endDate')

        if (!deviceId || !sensorId || !startDate || !endDate) {
          return NextResponse.json(
            { error: 'deviceId, sensorId, startDate, and endDate are required' },
            { status: 400 }
          )
        }

        const data = await getSensorDataWithRange(deviceId, sensorId, startDate, endDate)
        return NextResponse.json(data)
      }

      case 'getRollUpData': {
        const deviceId = searchParams.get('deviceId')
        const sensorId = searchParams.get('sensorId')
        const interval = searchParams.get('interval')
        const startDate = searchParams.get('startDate')
        const endDate = searchParams.get('endDate')
        const strictFilter = searchParams.get('strictFilter') === 'true'

        if (!deviceId || !sensorId || !interval || !startDate || !endDate) {
          return NextResponse.json(
            { error: 'deviceId, sensorId, interval, startDate, and endDate are required' },
            { status: 400 }
          )
        }

        const data = await getRollUpData(deviceId, sensorId, interval, startDate, endDate, strictFilter)
        return NextResponse.json(data)
      }

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    }
  } catch (error) {
    console.error('API error:', error)
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json(
      { error: message },
      { status: 500 }
    )
  }
}
