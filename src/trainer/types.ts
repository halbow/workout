export type TrainerStatus = 'disconnected' | 'connecting' | 'connected' | 'controlling' | 'error'

export interface TrainerData {
  /** Watts. */
  power?: number
  /** RPM. */
  cadence?: number
  /** km/h. */
  speed?: number
  heartRate?: number
  /** `Date.now()` when the reading arrived. */
  timestamp: number
}

export type TrainerEvent =
  | { type: 'data'; data: TrainerData }
  | { type: 'status'; status: TrainerStatus; error?: string }
  /** A command failed but the connection is still up. */
  | { type: 'error'; message: string }

export interface Trainer {
  readonly status: TrainerStatus
  /** Human-readable device name, once known. */
  readonly name?: string
  /** Must be called from a user gesture (button click) for Web Bluetooth. */
  connect(): Promise<void>
  /** Reconnects to the device paired by `connect()`, without showing the picker again. */
  reconnect(): Promise<void>
  disconnect(): Promise<void>
  /** Puts the trainer in ERG mode at `watts`, taking control first if needed. */
  setTargetPower(watts: number): Promise<void>
  /** ERG off (used for free ride segments). The next `setTargetPower` takes control again. */
  releaseControl(): Promise<void>
  subscribe(listener: (e: TrainerEvent) => void): () => void
}
