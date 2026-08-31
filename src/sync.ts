import { STORAGE_KEY } from './storage'

/**
 * True when a `storage` event represents a change to Timebase's data made by
 * another same-origin document (another dashboard tab, or the extension
 * popup) — as opposed to some other key, or a different storage area
 * entirely (e.g. sessionStorage, which also emits similarly-shaped events in
 * some environments).
 *
 * `event.key === null` covers `localStorage.clear()`, which is also a
 * change we need to react to.
 */
export function isTimebaseStorageEvent(event: Pick<StorageEvent, 'key' | 'storageArea'>, area: Storage = localStorage): boolean {
  if (event.storageArea !== null && event.storageArea !== area) return false
  return event.key === STORAGE_KEY || event.key === null
}

/**
 * Subscribes to `storage` events fired by other same-origin documents and
 * invokes `onExternalChange` whenever Timebase's data changed elsewhere.
 *
 * The native `storage` event only fires in documents *other* than the one
 * that made the change, so this never double-fires for a document's own
 * writes — callers don't need to guard against that themselves.
 *
 * Returns an unsubscribe function.
 */
export function watchForExternalChanges(onExternalChange: () => void): () => void {
  const handleStorage = (event: StorageEvent): void => {
    if (!isTimebaseStorageEvent(event)) return
    onExternalChange()
  }
  window.addEventListener('storage', handleStorage)
  return () => window.removeEventListener('storage', handleStorage)
}
