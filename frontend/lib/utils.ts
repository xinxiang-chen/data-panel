import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function pad3(n: number) {
  return String(n).padStart(3, "0");
}

function pad6(n: number) {
  return String(n).padStart(6, "0");
}

/**
 * Format as UTC ISO string with microseconds and trailing "Z",
 * matching Python's `datetime.utcnow().isoformat() + 'Z'` shape.
 *
 * Example: "2026-02-15T19:12:34.123000Z"
 */
export function toUtcIsoZ(date: Date): string {
  const y = date.getUTCFullYear();
  const m = pad2(date.getUTCMonth() + 1);
  const d = pad2(date.getUTCDate());
  const hh = pad2(date.getUTCHours());
  const mm = pad2(date.getUTCMinutes());
  const ss = pad2(date.getUTCSeconds());
  const micros = pad6(date.getUTCMilliseconds() * 1000);
  return `${y}-${m}-${d}T${hh}:${mm}:${ss}.${micros}Z`;
}

export function toUtcIsoFromDatetimeLocal(v: string): string {
  // datetime-local is "YYYY-MM-DDTHH:mm" in the user's local timezone.
  // `new Date(v)` interprets it as local; we serialize to UTC ISO + microseconds.
  const d = new Date(v);
  return toUtcIsoZ(d);
}

