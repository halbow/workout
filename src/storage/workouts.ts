import { createStore, del, entries, set } from 'idb-keyval'
import type { Workout } from '../workout'

export interface SavedWorkout {
  id: string
  importedAt: number
  workout: Workout
}

const store = createStore('erg-player', 'workouts')

export async function listWorkouts(): Promise<SavedWorkout[]> {
  const all = await entries<string, SavedWorkout>(store)
  return all.map(([, w]) => w).sort((a, b) => b.importedAt - a.importedAt)
}

export async function saveWorkout(workout: Workout): Promise<SavedWorkout> {
  const saved: SavedWorkout = { id: crypto.randomUUID(), importedAt: Date.now(), workout }
  await set(saved.id, saved, store)
  return saved
}

export async function deleteWorkout(id: string): Promise<void> {
  await del(id, store)
}
