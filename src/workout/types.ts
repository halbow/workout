/** Power values are fractions of FTP. Durations and offsets are in seconds. */
export type Segment =
  | { kind: 'steady'; duration: number; power: number; cadence?: number; label?: string }
  | {
      kind: 'ramp'
      duration: number
      powerStart: number
      powerEnd: number
      cadence?: number
      label?: string
    }
  /** ERG off, the rider controls effort. */
  | { kind: 'free'; duration: number; cadence?: number; label?: string }

export interface TextEvent {
  /** Seconds from the start of the workout. */
  offset: number
  message: string
  /** How long the message stays on screen, in seconds. */
  duration: number
}

export interface Workout {
  name: string
  author?: string
  description?: string
  /** Flattened, in order. */
  segments: Segment[]
  /** Sorted by offset. */
  textEvents: TextEvent[]
}
