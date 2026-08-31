import { afterEach, describe, expect, it, vi } from 'vitest'
import { STORAGE_KEY } from './storage'
import { isTimebaseStorageEvent, watchForExternalChanges } from './sync'

describe('isTimebaseStorageEvent', () => {
  it('is true for a change to the Timebase storage key', () => {
    const event = new StorageEvent('storage', { key: STORAGE_KEY, storageArea: localStorage })
    expect(isTimebaseStorageEvent(event)).toBe(true)
  })

  it('is true for localStorage.clear(), which reports a null key', () => {
    const event = new StorageEvent('storage', { key: null, storageArea: localStorage })
    expect(isTimebaseStorageEvent(event)).toBe(true)
  })

  it('is false for an unrelated storage key', () => {
    const event = new StorageEvent('storage', { key: 'some-other-app:data', storageArea: localStorage })
    expect(isTimebaseStorageEvent(event)).toBe(false)
  })

  it('is false when the event comes from a different storage area', () => {
    const event = new StorageEvent('storage', { key: STORAGE_KEY, storageArea: sessionStorage })
    expect(isTimebaseStorageEvent(event)).toBe(false)
  })
})

describe('watchForExternalChanges', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('invokes the callback when another document changes Timebase data', () => {
    const onExternalChange = vi.fn()
    watchForExternalChanges(onExternalChange)

    window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY, storageArea: localStorage }))

    expect(onExternalChange).toHaveBeenCalledTimes(1)
  })

  it('does not invoke the callback for unrelated storage changes', () => {
    const onExternalChange = vi.fn()
    watchForExternalChanges(onExternalChange)

    window.dispatchEvent(new StorageEvent('storage', { key: 'unrelated-key', storageArea: localStorage }))

    expect(onExternalChange).not.toHaveBeenCalled()
  })

  it('stops listening once unsubscribed', () => {
    const onExternalChange = vi.fn()
    const unsubscribe = watchForExternalChanges(onExternalChange)
    unsubscribe()

    window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY, storageArea: localStorage }))

    expect(onExternalChange).not.toHaveBeenCalled()
  })

  it('never fires for a document\'s own writes (the platform guarantee this relies on)', () => {
    // jsdom, like real browsers, does not synthesize a `storage` event for writes
    // made by the same document — only `window.dispatchEvent` (simulating another
    // tab) triggers the listener. This test documents that assumption so a future
    // change to how we persist data doesn't silently break cross-tab sync.
    const onExternalChange = vi.fn()
    watchForExternalChanges(onExternalChange)

    localStorage.setItem(STORAGE_KEY, '{}')

    expect(onExternalChange).not.toHaveBeenCalled()
  })
})
