export type HeartRateMonitorStatus = 'disconnected' | 'connecting' | 'connected' | 'error'

export interface HeartRateReading {
  /** Beats per minute. */
  bpm: number
  /** `Date.now()` when the reading arrived. */
  timestamp: number
}

export type HeartRateMonitorEvent =
  | { type: 'data'; reading: HeartRateReading }
  | { type: 'status'; status: HeartRateMonitorStatus; error?: string }

/** A read-only heart rate sensor (chest strap, armband…). */
export interface HeartRateMonitor {
  readonly status: HeartRateMonitorStatus
  /** Human-readable device name, once known. */
  readonly name?: string
  /** Must be called from a user gesture (button click) for Web Bluetooth. */
  connect(): Promise<void>
  /** Reconnects to the device paired by `connect()`, without showing the picker again. */
  reconnect(): Promise<void>
  disconnect(): Promise<void>
  subscribe(listener: (e: HeartRateMonitorEvent) => void): () => void
}
