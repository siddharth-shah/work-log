import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { loadData, saveData } from './storage'

// Regression coverage for pausing a timer: pausing should bank elapsed time
// without logging an entry, and a full start → pause → resume → stop cycle
// should produce exactly one log entry (not one per pause/resume click) —
// that fragmentation was the whole reason pause was added.

function seedProject() {
  const data = loadData()
  data.projects.push({ id: 'p1', name: 'Website', color: '#3157d5', createdAt: new Date().toISOString(), completedAt: null })
  saveData(data)
}

describe('main.ts: pause/resume', () => {
  beforeEach(async () => {
    vi.resetModules()
    localStorage.clear()
    document.body.innerHTML = '<div id="app"></div>'
    vi.useFakeTimers()
    seedProject()
    await import('./main')
    document.querySelector<HTMLButtonElement>('[data-select-project="p1"]')!.click()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('pausing banks elapsed time without logging an entry', () => {
    document.querySelector<HTMLButtonElement>('[data-start-timer="p1"]')!.click()
    vi.advanceTimersByTime(5_000)
    document.querySelector<HTMLButtonElement>('[data-pause-timer="p1"]')!.click()

    const data = loadData()
    expect(data.entries).toHaveLength(0)
    expect(data.activeTimer).not.toBeNull()
    expect(data.activeTimer?.running).toBe(false)
    expect(data.activeTimer?.segments.reduce((sum, s) => sum + s.durationSeconds, 0)).toBe(5)
  })

  it('shows "Paused" and stops the live clock while paused', () => {
    document.querySelector<HTMLButtonElement>('[data-start-timer="p1"]')!.click()
    vi.advanceTimersByTime(3_000)
    document.querySelector<HTMLButtonElement>('[data-pause-timer="p1"]')!.click()

    expect(document.body.textContent).toContain('Paused')
    const displayed = document.querySelector('[data-timer-display="p1"]')!.textContent
    vi.advanceTimersByTime(30_000)
    expect(document.querySelector('[data-timer-display="p1"]')!.textContent).toBe(displayed)
  })

  it('resuming continues accumulating from where it was paused', () => {
    document.querySelector<HTMLButtonElement>('[data-start-timer="p1"]')!.click()
    vi.advanceTimersByTime(5_000)
    document.querySelector<HTMLButtonElement>('[data-pause-timer="p1"]')!.click()
    document.querySelector<HTMLButtonElement>('[data-resume-timer="p1"]')!.click()
    vi.advanceTimersByTime(4_000)

    const data = loadData()
    const committed = data.activeTimer!.segments.reduce((sum, s) => sum + s.durationSeconds, 0)
    expect(data.activeTimer!.running).toBe(true)
    expect(committed).toBe(5)
    // the live 4s since resume isn't banked into segments until the next pause/stop
  })

  it('a full start → pause → resume → stop cycle logs exactly one entry with the combined duration', () => {
    document.querySelector<HTMLButtonElement>('[data-start-timer="p1"]')!.click()
    vi.advanceTimersByTime(10_000)
    document.querySelector<HTMLButtonElement>('[data-pause-timer="p1"]')!.click()

    vi.advanceTimersByTime(60_000) // the break itself must not count

    document.querySelector<HTMLButtonElement>('[data-resume-timer="p1"]')!.click()
    vi.advanceTimersByTime(5_000)
    document.querySelector<HTMLButtonElement>('[data-stop-timer="p1"]')!.click()

    const data = loadData()
    expect(data.activeTimer).toBeNull()
    expect(data.entries).toHaveLength(1)
    expect(data.entries[0].durationSeconds).toBe(15)
  })

  it('stopping while paused logs the banked time without needing a resume first', () => {
    document.querySelector<HTMLButtonElement>('[data-start-timer="p1"]')!.click()
    vi.advanceTimersByTime(7_000)
    document.querySelector<HTMLButtonElement>('[data-pause-timer="p1"]')!.click()
    document.querySelector<HTMLButtonElement>('[data-stop-timer="p1"]')!.click()

    const data = loadData()
    expect(data.activeTimer).toBeNull()
    expect(data.entries).toHaveLength(1)
    expect(data.entries[0].durationSeconds).toBe(7)
  })
})

describe('popup.ts: pause/resume', () => {
  beforeEach(async () => {
    vi.resetModules()
    localStorage.clear()
    document.body.innerHTML = '<div id="app"></div>'
    vi.useFakeTimers()
    seedProject()
    await import('./popup')
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('pausing from the popup banks time without logging an entry, and shows Resume', () => {
    document.querySelector<HTMLButtonElement>('[data-start="p1"]')!.click()
    vi.advanceTimersByTime(6_000)
    document.querySelector<HTMLButtonElement>('[data-pause="p1"]')!.click()

    expect(document.body.textContent).toContain('Paused')
    expect(document.querySelector('[data-resume="p1"]')).not.toBeNull()

    const data = loadData()
    expect(data.entries).toHaveLength(0)
    expect(data.activeTimer?.running).toBe(false)
  })

  it('a full pause → resume → stop cycle from the popup logs exactly one entry', () => {
    document.querySelector<HTMLButtonElement>('[data-start="p1"]')!.click()
    vi.advanceTimersByTime(8_000)
    document.querySelector<HTMLButtonElement>('[data-pause="p1"]')!.click()
    document.querySelector<HTMLButtonElement>('[data-resume="p1"]')!.click()
    vi.advanceTimersByTime(2_000)
    document.querySelector<HTMLButtonElement>('[data-stop="p1"]')!.click()

    const data = loadData()
    expect(data.activeTimer).toBeNull()
    expect(data.entries).toHaveLength(1)
    expect(data.entries[0].durationSeconds).toBe(10)
  })
})
