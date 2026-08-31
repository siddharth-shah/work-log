import { beforeEach, describe, expect, it } from 'vitest'
import { DATA_VERSION, STORAGE_KEY, emptyData, loadData, parseBackup, saveData, validateData } from './storage'

// Loosely typed on purpose — these tests deliberately construct malformed
// shapes to exercise validateData()'s rejections, so fields need to accept
// whatever a test throws at them rather than the strict AppData shape.
interface BackupFixture {
  [key: string]: unknown
  version: number
  projects: Record<string, unknown>[]
  entries: Record<string, unknown>[]
  activeTimer: Record<string, unknown> | null
}

function validBackup(): BackupFixture {
  return {
    version: DATA_VERSION,
    projects: [{ id: 'p1', name: 'Website', color: '#3157d5', createdAt: '2026-01-01T00:00:00.000Z', completedAt: null }],
    entries: [{ id: 'e1', projectId: 'p1', date: '2026-01-01', durationSeconds: 1800, note: '', createdAt: '2026-01-01T00:00:00.000Z' }],
    activeTimer: null,
  }
}

describe('validateData', () => {
  it('accepts a well-formed backup', () => {
    const result = validateData(validBackup())
    expect(result.projects).toHaveLength(1)
    expect(result.entries).toHaveLength(1)
  })

  it('rejects a payload with the wrong version', () => {
    expect(() => validateData({ ...validBackup(), version: 999 })).toThrow(/not a supported Timebase file/)
  })

  it('rejects a non-object payload', () => {
    expect(() => validateData('nope')).toThrow()
    expect(() => validateData(null)).toThrow()
    expect(() => validateData([1, 2, 3])).toThrow()
  })

  it('rejects when projects or entries are missing', () => {
    const backup: Partial<BackupFixture> = validBackup()
    delete backup.entries
    expect(() => validateData(backup)).toThrow(/missing its projects or time entries/)
  })

  it('rejects a project with a duplicate id', () => {
    const backup = validBackup()
    backup.projects.push({ ...backup.projects[0] })
    expect(() => validateData(backup)).toThrow(/projects in the backup are invalid/)
  })

  it('rejects a project with a blank name', () => {
    const backup = validBackup()
    backup.projects[0].name = '   '
    expect(() => validateData(backup)).toThrow(/projects in the backup are invalid/)
  })

  it('rejects an entry that references a project not in the backup', () => {
    const backup = validBackup()
    backup.entries[0].projectId = 'does-not-exist'
    expect(() => validateData(backup)).toThrow(/time entries in the backup are invalid/)
  })

  it('rejects an entry with a non-positive duration', () => {
    const backup = validBackup()
    backup.entries[0].durationSeconds = 0
    expect(() => validateData(backup)).toThrow(/time entries in the backup are invalid/)

    backup.entries[0].durationSeconds = -100
    expect(() => validateData(backup)).toThrow(/time entries in the backup are invalid/)
  })

  it('rejects an entry with a malformed date', () => {
    const backup = validBackup()
    backup.entries[0].date = 'not-a-date'
    expect(() => validateData(backup)).toThrow(/time entries in the backup are invalid/)
  })

  it('accepts a valid running timer pointing at an active project', () => {
    const backup = validBackup()
    backup.activeTimer = { projectId: 'p1', startedAt: Date.now() - 1000 }
    const result = validateData(backup)
    expect(result.activeTimer).toEqual({ ...backup.activeTimer, running: true, segments: [] })
  })

  it('defaults running/segments for a pre-pause-feature backup that lacks them', () => {
    const backup = validBackup()
    backup.activeTimer = { projectId: 'p1', startedAt: Date.now() - 1000 }
    const result = validateData(backup)
    expect(result.activeTimer?.running).toBe(true)
    expect(result.activeTimer?.segments).toEqual([])
  })

  it('accepts a paused timer with banked per-day segments', () => {
    const backup = validBackup()
    backup.activeTimer = {
      projectId: 'p1',
      startedAt: Date.now() - 1000,
      running: false,
      segments: [{ date: '2026-01-01', durationSeconds: 120 }],
    }
    const result = validateData(backup)
    expect(result.activeTimer).toEqual(backup.activeTimer)
  })

  it('rejects a timer whose segments contain an invalid entry', () => {
    const backup = validBackup()
    backup.activeTimer = {
      projectId: 'p1',
      startedAt: Date.now() - 1000,
      running: false,
      segments: [{ date: 'not-a-date', durationSeconds: 120 }],
    }
    expect(() => validateData(backup)).toThrow(/running timer in the backup is invalid/)
  })

  it('rejects a running timer pointing at a completed project', () => {
    const backup = validBackup()
    backup.projects[0].completedAt = '2026-01-02T00:00:00.000Z'
    backup.activeTimer = { projectId: 'p1', startedAt: Date.now() - 1000 }
    expect(() => validateData(backup)).toThrow(/running timer in the backup is invalid/)
  })

  it('rejects a running timer that starts in the future', () => {
    const backup = validBackup()
    backup.activeTimer = { projectId: 'p1', startedAt: Date.now() + 10 * 60_000 }
    expect(() => validateData(backup)).toThrow(/running timer in the backup is invalid/)
  })
})

describe('parseBackup', () => {
  it('parses valid JSON into AppData', () => {
    const result = parseBackup(JSON.stringify(validBackup()))
    expect(result.projects).toHaveLength(1)
  })

  it('reports invalid JSON distinctly from a validation failure', () => {
    expect(() => parseBackup('{not json')).toThrow(/does not contain valid JSON/)
  })
})

describe('loadData / saveData', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('returns empty data when nothing is stored', () => {
    expect(loadData()).toEqual(emptyData())
  })

  it('round-trips data written by saveData', () => {
    const data = validateData(validBackup())
    saveData(data)
    expect(loadData()).toEqual(data)
  })

  it('falls back to empty data instead of throwing on corrupt storage', () => {
    localStorage.setItem(STORAGE_KEY, '{not valid json')
    expect(loadData()).toEqual(emptyData())
  })

  it('falls back to empty data when stored data fails validation', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: DATA_VERSION, projects: 'nope', entries: [] }))
    expect(loadData()).toEqual(emptyData())
  })
})
