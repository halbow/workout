import type { HeartRateHub } from '../heart-rate'
import { log as logger } from '../logging'
import type { Trainer, TrainerData, TrainerEvent } from '../trainer/types'
import {
  segmentAt,
  segmentPower,
  textEventAt,
  totalDuration,
  type Segment,
  type TextEvent,
  type Workout,
} from '../workout'
import { realClock, type Clock } from './clock'

const log = logger.scope('runner')

export type RunnerState = 'idle' | 'running' | 'paused' | 'finished' | 'stopped'

export interface RunnerSnapshot {
  state: RunnerState
  /** Why the runner is paused. */
  pauseReason?: 'user' | 'trainer-disconnected'
  /** Seconds. */
  elapsed: number
  remaining: number
  total: number
  segmentIndex: number
  segment?: Segment
  segmentElapsed: number
  segmentRemaining: number
  /** Watts. Undefined during free segments. */
  targetPower?: number
  nextSegment?: Segment
  activeTextEvent?: TextEvent
  /** Last reading from the trainer, with the heart rate picked by the hub when there is one. */
  live: TrainerData
}

export interface WorkoutRunnerOptions {
  workout: Workout
  trainer: Trainer
  /** Heart rate from every source. Without it, the trainer's heart rate is used. */
  heartRate?: HeartRateHub
  /** Watts. */
  ftp: number
  clock?: Clock
  tickMs?: number
  /** Minimum time between two target changes inside a segment, in ms. */
  minSendIntervalMs?: number
  /** Target while paused, as a fraction of FTP, so the flywheel doesn't lock up. */
  pausePower?: number
}

/** Drives a trainer through a workout. Elapsed time comes from the clock, never from counting ticks. */
export class WorkoutRunner {
  private readonly workout: Workout
  private readonly trainer: Trainer
  private readonly heartRate?: HeartRateHub
  private readonly ftp: number
  private readonly clock: Clock
  private readonly tickMs: number
  private readonly minSendIntervalMs: number
  private readonly pausePower: number
  private readonly total: number

  private state: RunnerState = 'idle'
  private pauseReason?: RunnerSnapshot['pauseReason']
  private accumulatedMs = 0
  private runningSince = 0
  private cancelTick?: () => void

  private lastSentPower?: number
  private lastSentAt = -Infinity
  private lastSegmentIndex = -1
  private released = false

  private live: TrainerData = { timestamp: 0 }
  private snapshot: RunnerSnapshot
  private readonly listeners = new Set<() => void>()
  private unsubscribeTrainer?: () => void
  private unsubscribeHeartRate?: () => void

  constructor(options: WorkoutRunnerOptions) {
    this.workout = options.workout
    this.trainer = options.trainer
    this.heartRate = options.heartRate
    this.ftp = options.ftp
    this.clock = options.clock ?? realClock
    this.tickMs = options.tickMs ?? 250
    this.minSendIntervalMs = options.minSendIntervalMs ?? 1000
    this.pausePower = options.pausePower ?? 0.5
    this.total = totalDuration(this.workout)
    this.snapshot = this.buildSnapshot()
  }

  /**
   * Starts listening to the trainer (live data, disconnects) and heart rate. Returns a function that stops the
   * workout and detaches. Kept out of the constructor so React can own it in an effect.
   */
  attach(): () => void {
    this.unsubscribeTrainer ??= this.trainer.subscribe(this.onTrainerEvent)
    this.unsubscribeHeartRate ??= this.heartRate?.subscribe(() => this.publish())
    return () => {
      this.stop()
      this.cancelTick?.()
      this.cancelTick = undefined
      this.unsubscribeTrainer?.()
      this.unsubscribeTrainer = undefined
      this.unsubscribeHeartRate?.()
      this.unsubscribeHeartRate = undefined
    }
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /** Stable between changes, for `useSyncExternalStore`. */
  getSnapshot = (): RunnerSnapshot => this.snapshot

  start() {
    if (this.state !== 'idle') return
    this.run()
  }

  pause() {
    if (this.state !== 'running') return
    this.pauseWith('user')
  }

  resume() {
    if (this.state !== 'paused') return
    this.run()
  }

  stop() {
    if (this.state !== 'running' && this.state !== 'paused') return
    this.end('stopped')
  }

  private run() {
    log.info(this.state === 'paused' ? 'resumed' : 'started', { elapsed: this.elapsedMs() / 1000 })
    this.state = 'running'
    this.pauseReason = undefined
    this.runningSince = this.clock.now()
    // Force the current target to be sent again, and re-release control in free segments.
    this.lastSentPower = undefined
    this.lastSegmentIndex = -1
    this.released = false
    this.cancelTick = this.clock.every(this.tickMs, () => this.tick())
    this.tick()
  }

  private pauseWith(reason: NonNullable<RunnerSnapshot['pauseReason']>) {
    this.accumulatedMs = this.elapsedMs()
    log.info('paused', { reason, elapsed: this.accumulatedMs / 1000 })
    this.state = 'paused'
    this.pauseReason = reason
    this.cancelTick?.()
    this.cancelTick = undefined
    if (reason === 'user') this.send(Math.round(this.ftp * this.pausePower))
    this.publish()
  }

  private end(state: 'finished' | 'stopped') {
    this.accumulatedMs = Math.min(this.elapsedMs(), this.total * 1000)
    log.info(state, { elapsed: this.accumulatedMs / 1000 })
    this.state = state
    this.pauseReason = undefined
    this.cancelTick?.()
    this.cancelTick = undefined
    this.release()
    this.publish()
  }

  private tick() {
    const t = this.elapsedMs() / 1000
    const position = segmentAt(this.workout, t)
    if (!position) {
      this.end('finished')
      return
    }

    const segmentChanged = position.index !== this.lastSegmentIndex
    this.lastSegmentIndex = position.index
    if (segmentChanged) log.info(`segment ${position.index}`, position.segment)

    if (position.segment.kind === 'free') {
      if (!this.released) this.release()
    } else {
      this.released = false
      const target = this.targetFor(position.segment, position.elapsed)
      const throttled = this.clock.now() - this.lastSentAt < this.minSendIntervalMs
      if (target !== this.lastSentPower && (segmentChanged || !throttled)) this.send(target)
    }
    this.publish()
  }

  private targetFor(segment: Segment, segmentElapsed: number): number {
    const watts = (segmentPower(segment, segmentElapsed) ?? 0) * this.ftp
    // On ramps, round to 5 W so the target isn't resent every tick.
    return segment.kind === 'ramp' ? Math.round(watts / 5) * 5 : Math.round(watts)
  }

  private send(watts: number) {
    this.lastSentPower = watts
    this.lastSentAt = this.clock.now()
    if (!this.trainerReady()) return
    this.trainer.setTargetPower(watts).catch(() => {})
  }

  private release() {
    this.released = true
    this.lastSentPower = undefined
    if (!this.trainerReady()) return
    this.trainer.releaseControl().catch(() => {})
  }

  private trainerReady() {
    return this.trainer.status === 'connected' || this.trainer.status === 'controlling'
  }

  private onTrainerEvent = (event: TrainerEvent) => {
    if (event.type === 'data') {
      this.live = event.data
      this.publish()
    } else if (
      event.type === 'status' &&
      (event.status === 'disconnected' || event.status === 'error') &&
      this.state === 'running'
    ) {
      this.pauseWith('trainer-disconnected')
    }
  }

  private elapsedMs() {
    return this.state === 'running'
      ? this.accumulatedMs + (this.clock.now() - this.runningSince)
      : this.accumulatedMs
  }

  private publish() {
    this.snapshot = this.buildSnapshot()
    for (const listener of this.listeners) listener()
  }

  private buildSnapshot(): RunnerSnapshot {
    const elapsed = Math.min(this.elapsedMs() / 1000, this.total)
    const position = segmentAt(this.workout, elapsed)
    const segment = position?.segment
    return {
      state: this.state,
      pauseReason: this.pauseReason,
      elapsed,
      remaining: this.total - elapsed,
      total: this.total,
      segmentIndex: position?.index ?? this.workout.segments.length,
      segment,
      segmentElapsed: position?.elapsed ?? 0,
      segmentRemaining: position?.remaining ?? 0,
      targetPower:
        segment && segment.kind !== 'free' ? this.targetFor(segment, position.elapsed) : undefined,
      nextSegment: position ? this.workout.segments[position.index + 1] : undefined,
      activeTextEvent: textEventAt(this.workout, elapsed),
      live: this.heartRate ? { ...this.live, heartRate: this.heartRate.current() } : this.live,
    }
  }
}
