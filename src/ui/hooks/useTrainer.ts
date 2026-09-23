import { createContext, useContext, useSyncExternalStore } from 'react'
import type { TrainerSession } from '../trainer-session'

export const TrainerSessionContext = createContext<TrainerSession | null>(null)

export function useTrainerSession(): TrainerSession {
  const session = useContext(TrainerSessionContext)
  if (!session) throw new Error('useTrainerSession must be used inside TrainerSessionContext')
  return session
}

export function useTrainer() {
  const session = useTrainerSession()
  const snapshot = useSyncExternalStore(session.subscribe, session.getSnapshot)
  return {
    session,
    ...snapshot,
    ready: snapshot.status === 'connected' || snapshot.status === 'controlling',
  }
}
