import type { HeartRateHub, HeartRateMonitor, HeartRateMonitorStatus } from '../heart-rate'
import { BleHeartRateMonitor } from '../heart-rate/ble-heart-rate-monitor'
import { MockHeartRateMonitor } from '../heart-rate/mock-heart-rate-monitor'

export interface HeartRateMonitorSnapshot {
  status: HeartRateMonitorStatus
  simulated: boolean
  name?: string
  error?: string
  /** The strap disconnected on its own and has not come back yet. Cleared by a manual disconnect. */
  dropped: boolean
}

/** Owns the heart rate strap (real or simulated), feeds the hub, and exposes its state to React. */
export class HeartRateMonitorSession {
  monitor: HeartRateMonitor
  private snapshot: HeartRateMonitorSnapshot
  private readonly listeners = new Set<() => void>()
  private unsubscribe: () => void

  constructor(
    simulated: boolean,
    readonly hub: HeartRateHub,
  ) {
    this.monitor = createMonitor(simulated)
    this.snapshot = { status: this.monitor.status, simulated, dropped: false }
    this.unsubscribe = this.attach()
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getSnapshot = () => this.snapshot

  async setSimulated(simulated: boolean) {
    if (simulated === this.snapshot.simulated) return
    this.unsubscribe()
    await this.monitor.disconnect().catch(() => {})
    this.monitor = createMonitor(simulated)
    this.unsubscribe = this.attach()
    this.update({
      status: this.monitor.status,
      simulated,
      name: undefined,
      error: undefined,
      dropped: false,
    })
  }

  connect = () => this.run(() => this.monitor.connect())
  reconnect = () => this.run(() => this.monitor.reconnect())
  disconnect = () => this.run(() => this.monitor.disconnect())

  clearError = () => this.update({ error: undefined })

  private async run(action: () => Promise<void>) {
    this.update({ error: undefined })
    try {
      await action()
    } catch (error) {
      // BleHeartRateMonitor reports connection errors through a status event; this catches the rest.
      if (!this.snapshot.error && this.monitor.status !== 'disconnected') {
        this.update({ error: error instanceof Error ? error.message : String(error) })
      }
    }
  }

  private attach() {
    return this.monitor.subscribe((event) => {
      if (event.type === 'data') this.hub.push('sensor', event.reading)
      else {
        this.update({
          status: event.status,
          name: this.monitor.name,
          error: event.error,
          dropped:
            event.status === 'connected'
              ? false
              : event.status === 'disconnected'
                ? event.error !== undefined
                : this.snapshot.dropped,
        })
      }
    })
  }

  private update(patch: Partial<HeartRateMonitorSnapshot>) {
    this.snapshot = { ...this.snapshot, ...patch }
    for (const listener of this.listeners) listener()
  }
}

function createMonitor(simulated: boolean): HeartRateMonitor {
  return simulated ? new MockHeartRateMonitor() : new BleHeartRateMonitor()
}
