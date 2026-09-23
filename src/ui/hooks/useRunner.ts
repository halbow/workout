import { useSyncExternalStore } from 'react'
import type { WorkoutRunner } from '../../runner'

export function useRunner(runner: WorkoutRunner) {
  return useSyncExternalStore(runner.subscribe, runner.getSnapshot)
}
