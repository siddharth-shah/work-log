import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { STORAGE_KEY, loadData, saveData } from './storage'

// Mirrors main.sync.test.ts: proves the popup also reacts to changes made by
// the dashboard tab (the other half of the original bug report — they didn't
// listen to each other).

function seedProject() {
  const data = loadData()
  data.projects.push({ id: 'p1', name: 'Website', color: '#3157d5', createdAt: new Date().toISOString(), completedAt: null })
  saveData(data)
}

describe('popup reacts to external timer changes', () => {
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

  it('shows the quick-start list when nothing is running', () => {
    expect(document.body.textContent).toContain('Website')
    expect(document.body.textContent).not.toContain('Tracking now')
  })

  it('switches to the running view once the dashboard tab starts a timer', () => {
    const data = loadData()
    data.activeTimer = { projectId: 'p1', startedAt: Date.now() }
    saveData(data)

    window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY, storageArea: localStorage }))

    expect(document.body.textContent).toContain('Tracking now')
  })

  it('switches back to the quick-start list once the dashboard tab stops the timer', () => {
    let data = loadData()
    data.activeTimer = { projectId: 'p1', startedAt: Date.now() - 5000 }
    saveData(data)
    window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY, storageArea: localStorage }))
    expect(document.body.textContent).toContain('Tracking now')

    data = loadData()
    data.activeTimer = null
    saveData(data)
    window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY, storageArea: localStorage }))

    expect(document.body.textContent).not.toContain('Tracking now')
  })
})
