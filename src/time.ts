const SECONDS_IN_MINUTE = 60
const SECONDS_IN_HOUR = 60 * SECONDS_IN_MINUTE

// Always exact to the second — no "< 1m" bucket that hides short durations.
// Pass `asClock` for a fixed-width HH:MM:SS readout (used for live-ticking
// displays); otherwise a compact "1h 2m 3s" form that only shows the units
// that matter (skips leading zero units, but never drops seconds).
export function formatDuration(totalSeconds: number, asClock = false): string {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds))
  const hours = Math.floor(safeSeconds / SECONDS_IN_HOUR)
  const minutes = Math.floor((safeSeconds % SECONDS_IN_HOUR) / SECONDS_IN_MINUTE)
  const seconds = safeSeconds % SECONDS_IN_MINUTE

  if (asClock) {
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
  }

  const parts: string[] = []
  if (hours) parts.push(`${hours}h`)
  if (hours || minutes) parts.push(`${minutes}m`)
  parts.push(`${seconds}s`)
  return parts.join(' ')
}

export function formatDate(date: string): string {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(`${date}T12:00:00`))
}

export function formatShortDate(date: string): string {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
  }).format(new Date(`${date}T12:00:00`))
}

export function toLocalDate(value: Date | number = new Date()): string {
  const date = typeof value === 'number' ? new Date(value) : value
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function startOfLocalDay(value: Date | number): number {
  const date = typeof value === 'number' ? new Date(value) : new Date(value)
  date.setHours(0, 0, 0, 0)
  return date.getTime()
}

export interface DurationSegment {
  date: string
  durationSeconds: number
}

export function splitDurationByDay(startedAt: number, endedAt: number): DurationSegment[] {
  const segments: DurationSegment[] = []
  let cursor = startedAt

  while (cursor < endedAt) {
    const nextDay = new Date(cursor)
    nextDay.setHours(24, 0, 0, 0)
    const segmentEnd = Math.min(nextDay.getTime(), endedAt)
    const durationSeconds = Math.max(1, Math.round((segmentEnd - cursor) / 1000))
    segments.push({ date: toLocalDate(cursor), durationSeconds })
    cursor = segmentEnd
  }

  return segments
}

// Combines two sets of per-day duration segments, adding durations together
// wherever both sides touch the same date. Used to bank a timer's elapsed
// time across pause/resume cycles without fragmenting it into one log entry
// per cycle — the running segments are merged, not appended.
export function mergeDurationSegments(base: DurationSegment[], additions: DurationSegment[]): DurationSegment[] {
  const totals = new Map<string, number>()
  for (const segment of base) totals.set(segment.date, (totals.get(segment.date) ?? 0) + segment.durationSeconds)
  for (const segment of additions) totals.set(segment.date, (totals.get(segment.date) ?? 0) + segment.durationSeconds)
  return [...totals.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, durationSeconds]) => ({ date, durationSeconds }))
}

export function todayRunningSeconds(startedAt: number, now = Date.now()): number {
  const todayStart = startOfLocalDay(now)
  return Math.max(0, Math.floor((now - Math.max(startedAt, todayStart)) / 1000))
}
