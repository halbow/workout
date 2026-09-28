import { log as logger } from '../logging'
import { Emitter } from './emitter'
import type { Trainer, TrainerEvent, TrainerStatus } from './types'

export interface MockTrainerOptions {
  /** How often data is emitted, in ms. */
  tickMs?: number
  connectDelayMs?: number
  /** Returns a number in [0, 1). Inject a fixed value for deterministic tests. */
  random?: () => number
  /** Watts the simulated rider pushes when ERG is off. */
  freeRidePower?: number
}

const log = logger.scope('mock')

/** A simulated trainer: power follows the target with some lag and noise, cadence stays around 90. */
export class MockTrainer implements Trainer {
  readonly name = 'Simulated trainer'
  status: TrainerStatus = 'disconnected'

  private readonly emitter = new Emitter<TrainerEvent>()
  private readonly tickMs: number
  private readonly connectDelayMs: number
  private readonly random: () => number
  private readonly freeRidePower: number
  private timer?: ReturnType<typeof setInterval>
  private target?: number
  private power = 0

  /** Every command received, for tests. */
  readonly commands: Array<{ type: 'setTargetPower'; watts: number } | { type: 'releaseControl' }> =
    []

  constructor(options: MockTrainerOptions = {}) {
    this.tickMs = options.tickMs ?? 1000
    this.connectDelayMs = options.connectDelayMs ?? 300
    this.random = options.random ?? Math.random
    this.freeRidePower = options.freeRidePower ?? 150
  }

  subscribe(listener: (e: TrainerEvent) => void) {
    return this.emitter.subscribe(listener)
  }

  async connect() {
    this.setStatus('connecting')
    if (this.connectDelayMs > 0) await new Promise((r) => setTimeout(r, this.connectDelayMs))
    this.setStatus('controlling')
    this.timer = setInterval(() => this.tick(), this.tickMs)
  }

  reconnect() {
    return this.connect()
  }

  async disconnect() {
    this.stopTimer()
    this.setStatus('disconnected')
  }

  async setTargetPower(watts: number) {
    this.assertConnected()
    log.info(`→ set target power ${watts} W`)
    this.commands.push({ type: 'setTargetPower', watts })
    this.target = watts
    if (this.status === 'connected') this.setStatus('controlling')
  }

  async releaseControl() {
    this.assertConnected()
    log.info('→ release control')
    this.commands.push({ type: 'releaseControl' })
    this.target = undefined
    this.setStatus('connected')
  }

  /** Simulates the trainer dropping out (switched off, out of range). */
  simulateDisconnect() {
    this.stopTimer()
    this.setStatus('disconnected', 'The trainer disconnected.')
  }

  private tick() {
    const goal = this.target ?? this.freeRidePower
    const noise = (this.random() - 0.5) * 10
    this.power = Math.max(0, this.power + (goal - this.power) * 0.4 + noise)
    const data = {
      power: Math.round(this.power),
      cadence: Math.round(90 + (this.random() - 0.5) * 6),
      speed: Math.round((25 + this.power / 20) * 10) / 10,
      timestamp: Date.now(),
    }
    log.debug('← data', data)
    this.emitter.emit({ type: 'data', data })
  }

  private assertConnected() {
    if (this.status !== 'connected' && this.status !== 'controlling') {
      throw new Error('The trainer is not connected.')
    }
  }

  private stopTimer() {
    clearInterval(this.timer)
    this.timer = undefined
  }

  private setStatus(status: TrainerStatus, error?: string) {
    log.info(`status ${this.status} → ${status}`, error === undefined ? undefined : { error })
    this.status = status
    this.emitter.emit({ type: 'status', status, error })
  }
}
