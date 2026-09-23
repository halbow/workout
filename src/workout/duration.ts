import type { Segment, TextEvent, Workout } from './types'

export interface SegmentPosition {
  index: number
  segment: Segment
  /** Seconds from the start of the workout to the start of this segment. */
  start: number
  /** Seconds elapsed inside this segment. */
  elapsed: number
  remaining: number
}

export function totalDuration(workout: Workout): number {
  return workout.segments.reduce((sum, s) => sum + s.duration, 0)
}

/** The segment active at time `t`. Each segment covers `[start, start + duration)`. */
export function segmentAt(workout: Workout, t: number): SegmentPosition | undefined {
  if (t < 0) return undefined
  let start = 0
  for (const [index, segment] of workout.segments.entries()) {
    const end = start + segment.duration
    if (t < end) return { index, segment, start, elapsed: t - start, remaining: end - t }
    start = end
  }
  return undefined
}

/** Target power (fraction of FTP) at time `t`, or undefined in free segments and after the end. */
export function powerAt(workout: Workout, t: number): number | undefined {
  const position = segmentAt(workout, t)
  return position && segmentPower(position.segment, position.elapsed)
}

export function segmentPower(segment: Segment, elapsed: number): number | undefined {
  switch (segment.kind) {
    case 'steady':
      return segment.power
    case 'ramp': {
      const progress = Math.min(Math.max(elapsed / segment.duration, 0), 1)
      return segment.powerStart + (segment.powerEnd - segment.powerStart) * progress
    }
    case 'free':
      return undefined
  }
}

export function textEventAt(workout: Workout, t: number): TextEvent | undefined {
  let active: TextEvent | undefined
  for (const event of workout.textEvents) {
    if (event.offset > t) break
    if (t < event.offset + event.duration) active = event
  }
  return active
}

/** Formats seconds as `m:ss` or `h:mm:ss`. */
export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.ceil(seconds))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const ss = String(s).padStart(2, '0')
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`
}
