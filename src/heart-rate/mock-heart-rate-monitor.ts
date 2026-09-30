import { log as logger } from '../logging'
import { Emitter } from '../trainer/emitter'
import type { HeartRateMonitor, HeartRateMonitorEvent, HeartRateMonitorStatus } from './types'

export interface MockHeartRateMonitorOptions {
  /** How often data is emitted, in ms. */
  tickMs?: number
  connectDelayMs?: number
  /** Returns a number in [0, 1). Inject a fixed value for deterministic tests. */
  random?: () => number
}

const log = logger.scope('mock-hrm')

/** A simulated heart rate strap: drifts around 135 bpm. */
export class MockHeartRateMonitor implements HeartRateMonitor {
  readonly name = 'Simulated HR strap'
  status: HeartRateMonitorStatus = 'disconnected'

  private readonly emitter = new Emitter<HeartRateMonitorEvent>()
  private readonly tickMs: number
  private readonly connectDelayMs: number
  private readonly random: () => number
  private timer?: ReturnType<typeof setInterval>
  private bpm = 135

  constructor(options: MockHeartRateMonitorOptions = {}) {
    this.tickMs = options.tickMs ?? 1000
    this.connectDelayMs = options.connectDelayMs ?? 300
    this.random = options.random ?? Math.random
  }

  subscribe(listener: (e: HeartRateMonitorEvent) => void) {
    return this.emitter.subscribe(listener)
  }

  async connect() {
    this.setStatus('connecting')
    if (this.connectDelayMs > 0) await new Promise((r) => setTimeout(r, this.connectDelayMs))
    this.setStatus('connected')
    this.timer = setInterval(() => this.tick(), this.tickMs)
  }

  reconnect() {
    return this.connect()
  }

  async disconnect() {
    this.stopTimer()
    this.setStatus('disconnected')
  }

  /** Simulates the strap dropping out (out of range, battery). */
  simulateDisconnect() {
    this.stopTimer()
    this.setStatus('disconnected', 'The heart rate strap disconnected.')
  }

  private tick() {
    const drift = (this.random() - 0.5) * 4
    this.bpm = Math.min(185, Math.max(90, this.bpm + drift + (135 - this.bpm) * 0.05))
    const reading = { bpm: Math.round(this.bpm), timestamp: Date.now() }
    log.debug('← heart rate', reading)
    this.emitter.emit({ type: 'data', reading })
  }

  private stopTimer() {
    clearInterval(this.timer)
    this.timer = undefined
  }

  private setStatus(status: HeartRateMonitorStatus, error?: string) {
    log.info(`status ${this.status} → ${status}`, error === undefined ? undefined : { error })
    this.status = status
    this.emitter.emit({ type: 'status', status, error })
  }
}
