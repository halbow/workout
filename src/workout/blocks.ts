import type { Segment, TextEvent, Workout } from './types'

/**
 * One element of a `.zwo` workout, as edited in the editor. Like segments, power values are
 * fractions of FTP and durations are in seconds. A block can expand into several segments.
 */
export type Block =
  | { kind: 'steady'; duration: number; power: number; cadence?: number }
  | {
      kind: 'warmup' | 'cooldown' | 'ramp'
      duration: number
      powerStart: number
      powerEnd: number
      cadence?: number
    }
  | {
      kind: 'interval'
      repeat: number
      onDuration: number
      onPower: number
      offDuration: number
      offPower: number
      cadence?: number
      cadenceResting?: number
    }
  /** ERG off, the rider controls effort. */
  | { kind: 'freeride' | 'maxeffort'; duration: number; cadence?: number }

export type BlockKind = Block['kind']

/** A `.zwo` file: metadata, blocks, and text events at absolute offsets. */
export interface ZwoDocument {
  name: string
  author?: string
  description?: string
  blocks: Block[]
  /** Sorted by offset. */
  textEvents: TextEvent[]
}

const MINUTE = 60
const HOUR = 60 * MINUTE

/** Editor limits. Durations are in seconds. */
export const LIMITS = {
  blocks: 20,
  /** Warmup, cooldown and ramp. */
  rampDuration: 30 * MINUTE,
  /** Steady, free ride and max effort. */
  steadyDuration: 12 * HOUR,
  intervalRepeat: 20,
  /** Each on and off step of an interval. */
  intervalStepDuration: 30 * MINUTE,
}

/** Largest allowed value for a block's duration field, in seconds. */
export function maxDuration(kind: BlockKind): number {
  switch (kind) {
    case 'warmup':
    case 'cooldown':
    case 'ramp':
      return LIMITS.rampDuration
    case 'interval':
      return LIMITS.intervalStepDuration
    case 'steady':
    case 'freeride':
    case 'maxeffort':
      return LIMITS.steadyDuration
  }
}

/** Human-readable problems that prevent saving the block; empty when it is valid. */
export function blockErrors(block: Block): string[] {
  const errors: string[] = []
  const max = maxDuration(block.kind)
  const checkDuration = (label: string, seconds: number, allowZero = false) => {
    if (seconds < 0 || (!allowZero && seconds === 0)) errors.push(`${label} must be more than 0.`)
    else if (seconds > max) errors.push(`${label} must be at most ${formatLimit(max)}.`)
  }
  const checkPower = (label: string, power: number) => {
    if (!(power > 0)) errors.push(`${label} must be more than 0% FTP.`)
  }
  switch (block.kind) {
    case 'steady':
      checkDuration('Duration', block.duration)
      checkPower('Power', block.power)
      break
    case 'freeride':
    case 'maxeffort':
      checkDuration('Duration', block.duration)
      break
    case 'warmup':
    case 'cooldown':
    case 'ramp':
      checkDuration('Duration', block.duration)
      checkPower('From', block.powerStart)
      checkPower('To', block.powerEnd)
      break
    case 'interval':
      if (!Number.isInteger(block.repeat) || block.repeat < 1)
        errors.push('Repeat must be at least 1.')
      else if (block.repeat > LIMITS.intervalRepeat)
        errors.push(`Repeat must be at most ${LIMITS.intervalRepeat}.`)
      checkDuration('On', block.onDuration)
      checkPower('On power', block.onPower)
      checkDuration('Off', block.offDuration, true)
      checkPower('Off power', block.offPower)
      break
  }
  return errors
}

function formatLimit(seconds: number): string {
  return seconds >= HOUR ? `${seconds / HOUR} h` : `${seconds / MINUTE} min`
}

export function defaultBlock(kind: BlockKind): Block {
  switch (kind) {
    case 'steady':
      return { kind, duration: 600, power: 0.75 }
    case 'warmup':
      return { kind, duration: 600, powerStart: 0.5, powerEnd: 0.75 }
    case 'cooldown':
      return { kind, duration: 600, powerStart: 0.75, powerEnd: 0.5 }
    case 'ramp':
      return { kind, duration: 300, powerStart: 0.6, powerEnd: 0.9 }
    case 'interval':
      return {
        kind,
        repeat: 5,
        onDuration: 60,
        onPower: 1.1,
        offDuration: 60,
        offPower: 0.55,
      }
    case 'freeride':
      return { kind, duration: 600 }
    case 'maxeffort':
      return { kind, duration: 20 }
  }
}

export function blockDuration(block: Block): number {
  return block.kind === 'interval'
    ? block.repeat * (block.onDuration + block.offDuration)
    : block.duration
}

export function blocksDuration(blocks: Block[]): number {
  return blocks.reduce((sum, b) => sum + blockDuration(b), 0)
}

export function blockToSegments(block: Block): Segment[] {
  const { cadence } = block
  switch (block.kind) {
    case 'steady':
      return [
        { kind: 'steady', duration: block.duration, power: block.power, cadence, label: 'Steady' },
      ]
    case 'warmup':
    case 'cooldown':
    case 'ramp':
      return [
        {
          kind: 'ramp',
          duration: block.duration,
          powerStart: block.powerStart,
          powerEnd: block.powerEnd,
          cadence,
          label: RAMP_LABELS[block.kind],
        },
      ]
    case 'interval': {
      const out: Segment[] = []
      for (let i = 1; i <= block.repeat; i++) {
        const group = `Interval ${i}/${block.repeat}`
        out.push({
          kind: 'steady',
          duration: block.onDuration,
          power: block.onPower,
          cadence,
          label: `${group} on`,
        })
        out.push({
          kind: 'steady',
          duration: block.offDuration,
          power: block.offPower,
          cadence: block.cadenceResting,
          label: `${group} off`,
        })
      }
      // The runner can't play zero-length steps.
      return out.filter((s) => s.duration > 0)
    }
    case 'freeride':
    case 'maxeffort':
      return [
        {
          kind: 'free',
          duration: block.duration,
          cadence,
          label: block.kind === 'freeride' ? 'Free ride' : 'Max effort',
        },
      ]
  }
}

const RAMP_LABELS = { warmup: 'Warmup', cooldown: 'Cooldown', ramp: 'Ramp' }

export function documentToWorkout(doc: ZwoDocument): Workout {
  return {
    name: doc.name.trim() || 'Untitled workout',
    author: doc.author,
    description: doc.description,
    segments: doc.blocks.flatMap(blockToSegments),
    textEvents: doc.textEvents,
  }
}

/** Returns a copy of `items` with the item at `from` moved to index `to`. */
export function moveItem<T>(items: T[], from: number, to: number): T[] {
  const out = [...items]
  const [item] = out.splice(from, 1)
  if (item === undefined) return items
  out.splice(Math.max(0, Math.min(to, out.length)), 0, item)
  return out
}
