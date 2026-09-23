import { describe, expect, it } from 'vitest'
import { formatDuration, powerAt, segmentAt, textEventAt, totalDuration } from '../duration'
import type { Workout } from '../types'

const workout: Workout = {
  name: 'T',
  segments: [
    { kind: 'steady', duration: 60, power: 0.5 },
    { kind: 'ramp', duration: 100, powerStart: 0.5, powerEnd: 1.0 },
    { kind: 'free', duration: 30 },
    { kind: 'ramp', duration: 100, powerStart: 0.8, powerEnd: 0.4 },
  ],
  textEvents: [
    { offset: 10, message: 'a', duration: 10 },
    { offset: 15, message: 'b', duration: 3 },
  ],
}

describe('duration helpers', () => {
  it('computes the total duration', () => {
    expect(totalDuration(workout)).toBe(290)
  })

  it('finds the segment at segment boundaries', () => {
    expect(segmentAt(workout, -1)).toBeUndefined()
    expect(segmentAt(workout, 0)).toMatchObject({ index: 0, start: 0, elapsed: 0, remaining: 60 })
    expect(segmentAt(workout, 59.9)?.index).toBe(0)
    expect(segmentAt(workout, 60)).toMatchObject({
      index: 1,
      start: 60,
      elapsed: 0,
      remaining: 100,
    })
    expect(segmentAt(workout, 289.9)?.index).toBe(3)
    expect(segmentAt(workout, 290)).toBeUndefined()
  })

  it('computes power at boundaries and mid-ramp', () => {
    expect(powerAt(workout, 0)).toBe(0.5)
    expect(powerAt(workout, 60)).toBe(0.5)
    expect(powerAt(workout, 110)).toBeCloseTo(0.75)
    expect(powerAt(workout, 159.999)).toBeCloseTo(1.0)
    expect(powerAt(workout, 170)).toBeUndefined() // free
    expect(powerAt(workout, 240)).toBeCloseTo(0.6) // descending ramp
    expect(powerAt(workout, 290)).toBeUndefined() // finished
  })

  it('finds the active text event', () => {
    expect(textEventAt(workout, 9)).toBeUndefined()
    expect(textEventAt(workout, 12)?.message).toBe('a')
    expect(textEventAt(workout, 16)?.message).toBe('b')
    expect(textEventAt(workout, 19)?.message).toBe('a')
    expect(textEventAt(workout, 20)).toBeUndefined()
  })

  it('formats durations', () => {
    expect(formatDuration(0)).toBe('0:00')
    expect(formatDuration(65)).toBe('1:05')
    expect(formatDuration(59.2)).toBe('1:00')
    expect(formatDuration(3725)).toBe('1:02:05')
  })
})
