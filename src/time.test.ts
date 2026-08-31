import { describe, expect, it } from 'vitest'
import { formatDuration, splitDurationByDay, toLocalDate, todayRunningSeconds } from './time'

describe('formatDuration', () => {
  it('shows 0m for zero seconds', () => {
    expect(formatDuration(0)).toBe('0m')
  })

  it('shows < 1m for a non-zero duration under a minute', () => {
    expect(formatDuration(30)).toBe('< 1m')
  })

  it('shows only minutes under an hour', () => {
    expect(formatDuration(25 * 60)).toBe('25m')
  })

  it('shows only hours on an exact hour', () => {
    expect(formatDuration(2 * 3600)).toBe('2h')
  })

  it('shows hours and minutes together', () => {
    expect(formatDuration(2 * 3600 + 15 * 60)).toBe('2h 15m')
  })

  it('clamps negative input to zero instead of showing a negative duration', () => {
    expect(formatDuration(-500)).toBe('0m')
  })

  it('includes seconds as HH:MM:SS when requested', () => {
    expect(formatDuration(3661, true)).toBe('01:01:01')
  })

  it('pads HH:MM:SS for durations under ten of any unit', () => {
    expect(formatDuration(5, true)).toBe('00:00:05')
  })
})

describe('toLocalDate', () => {
  it('formats a Date as YYYY-MM-DD', () => {
    expect(toLocalDate(new Date(2026, 0, 5, 13, 0, 0))).toBe('2026-01-05')
  })

  it('pads single-digit months and days', () => {
    expect(toLocalDate(new Date(2026, 2, 9, 0, 0, 0))).toBe('2026-03-09')
  })

  it('accepts an epoch millisecond timestamp', () => {
    const date = new Date(2026, 5, 15, 12, 0, 0)
    expect(toLocalDate(date.getTime())).toBe('2026-06-15')
  })
})

describe('splitDurationByDay', () => {
  it('returns a single segment when the session stays within one day', () => {
    const start = new Date(2026, 0, 1, 9, 0, 0).getTime()
    const end = new Date(2026, 0, 1, 11, 30, 0).getTime()
    const segments = splitDurationByDay(start, end)
    expect(segments).toEqual([{ date: '2026-01-01', durationSeconds: 2.5 * 3600 }])
  })

  it('splits a session that crosses midnight into two dated segments', () => {
    const start = new Date(2026, 0, 1, 23, 0, 0).getTime()
    const end = new Date(2026, 0, 2, 1, 0, 0).getTime()
    const segments = splitDurationByDay(start, end)
    expect(segments).toEqual([
      { date: '2026-01-01', durationSeconds: 3600 },
      { date: '2026-01-02', durationSeconds: 3600 },
    ])
  })

  it('splits a session that spans multiple full days', () => {
    const start = new Date(2026, 0, 1, 22, 0, 0).getTime()
    const end = new Date(2026, 0, 3, 2, 0, 0).getTime()
    const segments = splitDurationByDay(start, end)
    expect(segments.map((segment) => segment.date)).toEqual(['2026-01-01', '2026-01-02', '2026-01-03'])
    expect(segments.reduce((sum, segment) => sum + segment.durationSeconds, 0)).toBe(28 * 3600)
  })

  it('never produces a zero-duration segment for a very short session', () => {
    const start = Date.now()
    const segments = splitDurationByDay(start, start + 400)
    expect(segments).toHaveLength(1)
    expect(segments[0].durationSeconds).toBeGreaterThanOrEqual(1)
  })
})

describe('todayRunningSeconds', () => {
  it('counts the full elapsed time when the timer started today', () => {
    const now = new Date(2026, 0, 1, 10, 0, 0).getTime()
    const startedAt = new Date(2026, 0, 1, 9, 0, 0).getTime()
    expect(todayRunningSeconds(startedAt, now)).toBe(3600)
  })

  it("only counts the portion since midnight when the timer started yesterday", () => {
    const now = new Date(2026, 0, 2, 1, 0, 0).getTime()
    const startedAt = new Date(2026, 0, 1, 22, 0, 0).getTime()
    expect(todayRunningSeconds(startedAt, now)).toBe(3600)
  })
})
