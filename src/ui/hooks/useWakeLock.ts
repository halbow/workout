import { useEffect } from 'react'

/** Keeps the screen on while `active` is true (Screen Wake Lock API, where supported). */
export function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return
    let sentinel: WakeLockSentinel | undefined
    let cancelled = false

    const request = async () => {
      try {
        const lock = await navigator.wakeLock.request('screen')
        if (cancelled) void lock.release()
        else sentinel = lock
      } catch {
        // Denied (e.g. low battery): not critical.
      }
    }
    // The lock is dropped when the tab is hidden; take it again when it comes back.
    const onVisible = () => {
      if (document.visibilityState === 'visible') void request()
    }

    void request()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisible)
      void sentinel?.release()
    }
  }, [active])
}
