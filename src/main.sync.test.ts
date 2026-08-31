import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { STORAGE_KEY, loadData, saveData } from './storage'

// Regression coverage for the bug where the dashboard tab and the extension
// popup didn't hear about timers started/stopped by each other. main.ts has
// module-level state and self-executing side effects (it renders and wires
// up listeners as soon as it's imported), so this drives it the way a real
// browser tab would: seed localStorage the way another tab/popup would, fire
// the `storage` event a real browser fires, and assert the DOM updates
// without any direct call into main.ts's internals.

function seedProject() {
  const data = loadData()
  data.projects.push({ id: 'p1', name: 'Website', color: '#3157d5', createdAt: new Date().toISOString(), completedAt: null })
  saveData(data)
  return data
}

describe('dashboard tab reacts to external timer changes', () => {
  beforeEach(async () => {
    vi.resetModules()
    localStorage.clear()
    document.body.innerHTML = '<div id="app"></div>'
    vi.useFakeTimers()
    seedProject()
    await import('./main')
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders the seeded project as not running on initial load', () => {
    expect(document.body.textContent).toContain('Website')
    expect(document.body.textContent).not.toContain('Tracking now')
  })

  it('picks up a timer started by another tab/popup once the storage event fires', () => {
    const data = loadData()
    data.activeTimer = { projectId: 'p1', startedAt: Date.now(), running: true, segments: [] }
    saveData(data)

    window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY, storageArea: localStorage }))

    expect(document.body.textContent).toContain('Tracking now')
  })

  it('picks up a timer stopped by another tab/popup once the storage event fires', () => {
    let data = loadData()
    data.activeTimer = { projectId: 'p1', startedAt: Date.now() - 5000, running: true, segments: [] }
    saveData(data)
    window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY, storageArea: localStorage }))
    expect(document.body.textContent).toContain('Tracking now')

    data = loadData()
    data.activeTimer = null
    saveData(data)
    window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY, storageArea: localStorage }))

    expect(document.body.textContent).not.toContain('Tracking now')
  })

  it('does not clobber a dialog the user has open when an external change arrives', () => {
    document.querySelector<HTMLButtonElement>('[data-open-project]')!.click()
    const dialog = document.querySelector<HTMLDialogElement>('#project-dialog')!
    expect(dialog.open).toBe(true)

    const data = loadData()
    data.activeTimer = { projectId: 'p1', startedAt: Date.now(), running: true, segments: [] }
    saveData(data)
    window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY, storageArea: localStorage }))

    expect(document.querySelector<HTMLDialogElement>('#project-dialog')!.open).toBe(true)
  })
})
