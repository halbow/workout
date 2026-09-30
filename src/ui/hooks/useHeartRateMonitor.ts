import { createContext, useContext, useSyncExternalStore } from 'react'
import type { HeartRateMonitorSession } from '../heart-rate-monitor-session'

export const HeartRateMonitorContext = createContext<HeartRateMonitorSession | null>(null)

export function useHeartRateMonitorSession(): HeartRateMonitorSession {
  const session = useContext(HeartRateMonitorContext)
  if (!session) {
    throw new Error('useHeartRateMonitorSession must be used inside HeartRateMonitorContext')
  }
  return session
}

export function useHeartRateMonitor() {
  const session = useHeartRateMonitorSession()
  const snapshot = useSyncExternalStore(session.subscribe, session.getSnapshot)
  return { session, ...snapshot }
}
