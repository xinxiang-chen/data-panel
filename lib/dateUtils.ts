import { format, parse, isValid } from 'date-fns'

/**
 * Format date to ISO 8601 format expected by IoT API
 * Format: YYYY-MM-DDTHH:MM:SS.fffZ
 */
export function formatDateForAPI(date: Date | string): string {
  const d = typeof date === 'string' ? parse(date, 'yyyy-MM-dd', new Date()) : date
  if (!isValid(d)) {
    throw new Error('Invalid date')
  }
  return format(d, "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'")
}

/**
 * Parse ISO 8601 date string from API
 */
export function parseAPIDate(dateString: string): Date {
  const date = parse(dateString, "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", new Date())
  if (!isValid(date)) {
    throw new Error(`Invalid date string: ${dateString}`)
  }
  return date
}

/**
 * Format date for display
 */
export function formatDateForDisplay(date: Date | string): string {
  const d = typeof date === 'string' ? parseAPIDate(date) : date
  return format(d, 'MMM dd, yyyy HH:mm:ss')
}

/**
 * Format date as short date string (MM/dd/yyyy)
 */
export function formatDateShort(date: Date): string {
  return format(date, 'MM/dd/yyyy')
}

/**
 * Format date as time string (HH:mm:ss)
 */
export function formatTime(date: Date): string {
  return format(date, 'HH:mm:ss')
}
