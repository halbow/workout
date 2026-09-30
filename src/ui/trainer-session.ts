import type { HeartRateHub } from '../heart-rate'
import { FtmsTrainer } from '../trainer/ftms/ftms-trainer'
import { MockTrainer } from '../trainer/mock-trainer'
import type { Trainer, TrainerData, TrainerStatus } from '../trainer/types'

export interface TrainerSessionSnapshot {
  status: TrainerStatus
  simulated: boolean
  name?: string
  /** Connection error, or the last failed command. */
  error?: string
  live: TrainerData
}

/** Owns the current trainer (real or simulated) and exposes its state to React. */
export class TrainerSession {
  trainer: Trainer
  private snapshot: TrainerSessionSnapshot
  private readonly listeners = new Set<() => void>()
  private unsubscribe: () => void

  constructor(
    simulated: boolean,
    private readonly heartRate: HeartRateHub,
  ) {
    this.trainer = createTrainer(simulated)
    this.snapshot = { status: this.trainer.status, simulated, live: { timestamp: 0 } }
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
    await this.trainer.disconnect().catch(() => {})
    this.trainer = createTrainer(simulated)
    this.unsubscribe = this.attach()
    this.update({
      status: this.trainer.status,
      simulated,
      name: undefined,
      error: undefined,
      live: { timestamp: 0 },
    })
  }

  connect = () => this.run(() => this.trainer.connect())
  reconnect = () => this.run(() => this.trainer.reconnect())
  disconnect = () => this.run(() => this.trainer.disconnect())

  clearError = () => this.update({ error: undefined })

  private async run(action: () => Promise<void>) {
    this.update({ error: undefined })
    try {
      await action()
    } catch (error) {
      // FtmsTrainer reports connection errors through a status event; this catches the rest.
      if (!this.snapshot.error && this.trainer.status !== 'disconnected') {
        this.update({ error: error instanceof Error ? error.message : String(error) })
      }
    }
  }

  private attach() {
    return this.trainer.subscribe((event) => {
      if (event.type === 'data') {
        const { heartRate, timestamp } = event.data
        if (heartRate !== undefined) this.heartRate.push('trainer', { bpm: heartRate, timestamp })
        this.update({ live: event.data })
      } else if (event.type === 'status') {
        this.update({ status: event.status, name: this.trainer.name, error: event.error })
      } else this.update({ error: event.message })
    })
  }

  private update(patch: Partial<TrainerSessionSnapshot>) {
    this.snapshot = { ...this.snapshot, ...patch }
    for (const listener of this.listeners) listener()
  }
}

function createTrainer(simulated: boolean): Trainer {
  return simulated ? new MockTrainer() : new FtmsTrainer()
}
