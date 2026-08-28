const SECONDS_IN_MINUTE = 60
const SECONDS_IN_HOUR = 60 * SECONDS_IN_MINUTE

export function formatDuration(totalSeconds: number, includeSeconds = false): string {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds))
  const hours = Math.floor(safeSeconds / SECONDS_IN_HOUR)
  const minutes = Math.floor((safeSeconds % SECONDS_IN_HOUR) / SECONDS_IN_MINUTE)
  const seconds = safeSeconds % SECONDS_IN_MINUTE

  if (includeSeconds) {
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
  }

  if (hours === 0 && minutes === 0) return safeSeconds > 0 ? '< 1m' : '0m'
  if (hours === 0) return `${minutes}m`
  if (minutes === 0) return `${hours}h`
  return `${hours}h ${minutes}m`
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

export function splitDurationByDay(startedAt: number, endedAt: number): Array<{ date: string; durationSeconds: number }> {
  const segments: Array<{ date: string; durationSeconds: number }> = []
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

export function todayRunningSeconds(startedAt: number, now = Date.now()): number {
  const todayStart = startOfLocalDay(now)
  return Math.max(0, Math.floor((now - Math.max(startedAt, todayStart)) / 1000))
}
