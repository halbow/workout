import { createStore, del, entries, get, set } from 'idb-keyval'
import { parseZwo, serializeZwo, type Block, type Segment, type Workout } from '../workout'

/** What is stored: the `.zwo` file itself, so it can be edited and exported as is. */
interface StoredWorkout {
  id: string
  importedAt: number
  zwo: string
}

/** Before workouts were stored as `.zwo`, the parsed workout was stored. */
interface LegacyStoredWorkout {
  id: string
  importedAt: number
  workout: Workout
}

export interface SavedWorkout extends StoredWorkout {
  workout: Workout
}

const store = createStore('erg-player', 'workouts')

export async function listWorkouts(): Promise<SavedWorkout[]> {
  const all = await entries<string, StoredWorkout | LegacyStoredWorkout>(store)
  const out: SavedWorkout[] = []
  for (const [, record] of all) {
    const stored = 'zwo' in record ? record : await migrate(record)
    out.push({ ...stored, workout: parseZwo(stored.zwo) })
  }
  return out.sort((a, b) => b.importedAt - a.importedAt)
}

export async function saveWorkout(zwo: string): Promise<void> {
  const stored: StoredWorkout = { id: crypto.randomUUID(), importedAt: Date.now(), zwo }
  await set(stored.id, stored, store)
}

export async function updateWorkout(id: string, zwo: string): Promise<void> {
  const existing = await get<StoredWorkout>(id, store)
  if (!existing) throw new Error(`No workout with id ${id}.`)
  await set(id, { ...existing, zwo }, store)
}

export async function deleteWorkout(id: string): Promise<void> {
  await del(id, store)
}

async function migrate({ id, importedAt, workout }: LegacyStoredWorkout): Promise<StoredWorkout> {
  const stored: StoredWorkout = {
    id,
    importedAt,
    zwo: serializeZwo({ ...workout, blocks: workout.segments.map(segmentToBlock) }),
  }
  await set(id, stored, store)
  return stored
}

// Intervals were flattened on import, so they come back as separate steady blocks.
function segmentToBlock(segment: Segment): Block {
  switch (segment.kind) {
    case 'steady':
      return {
        kind: 'steady',
        duration: segment.duration,
        power: segment.power,
        cadence: segment.cadence,
      }
    case 'ramp':
      return {
        kind:
          segment.label === 'Warmup'
            ? 'warmup'
            : segment.label === 'Cooldown'
              ? 'cooldown'
              : 'ramp',
        duration: segment.duration,
        powerStart: segment.powerStart,
        powerEnd: segment.powerEnd,
        cadence: segment.cadence,
      }
    case 'free':
      return {
        kind: segment.label === 'Max effort' ? 'maxeffort' : 'freeride',
        duration: segment.duration,
        cadence: segment.cadence,
      }
  }
}
