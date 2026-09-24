import { describe, expect, it } from 'vitest'
import {
  blockErrors,
  blocksDuration,
  documentToWorkout,
  defaultBlock,
  LIMITS,
  moveItem,
  type Block,
  type BlockKind,
} from '../blocks'
import { totalDuration } from '../duration'

const blocks: Block[] = [
  { kind: 'warmup', duration: 600, powerStart: 0.5, powerEnd: 0.75 },
  { kind: 'steady', duration: 300, power: 0.8 },
  { kind: 'interval', repeat: 3, onDuration: 60, onPower: 1.2, offDuration: 30, offPower: 0.5 },
  { kind: 'cooldown', duration: 300, powerStart: 0.7, powerEnd: 0.4 },
]

describe('blocksDuration', () => {
  it('sums blocks, counting every interval repeat', () => {
    expect(blocksDuration(blocks)).toBe(600 + 300 + 3 * 90 + 300)
  })

  it('is zero for no blocks', () => {
    expect(blocksDuration([])).toBe(0)
  })
})

describe('documentToWorkout', () => {
  it('expands blocks into segments in order', () => {
    const workout = documentToWorkout({ name: '  Test  ', blocks, textEvents: [] })
    expect(workout.name).toBe('Test')
    expect(workout.textEvents).toEqual([])
    expect(workout.segments).toEqual([
      { kind: 'ramp', duration: 600, powerStart: 0.5, powerEnd: 0.75, label: 'Warmup' },
      { kind: 'steady', duration: 300, power: 0.8, label: 'Steady' },
      { kind: 'steady', duration: 60, power: 1.2, label: 'Interval 1/3 on' },
      { kind: 'steady', duration: 30, power: 0.5, label: 'Interval 1/3 off' },
      { kind: 'steady', duration: 60, power: 1.2, label: 'Interval 2/3 on' },
      { kind: 'steady', duration: 30, power: 0.5, label: 'Interval 2/3 off' },
      { kind: 'steady', duration: 60, power: 1.2, label: 'Interval 3/3 on' },
      { kind: 'steady', duration: 30, power: 0.5, label: 'Interval 3/3 off' },
      { kind: 'ramp', duration: 300, powerStart: 0.7, powerEnd: 0.4, label: 'Cooldown' },
    ])
    expect(totalDuration(workout)).toBe(blocksDuration(blocks))
  })

  it('drops zero-length recoveries', () => {
    const workout = documentToWorkout({
      name: 'x',
      blocks: [
        { kind: 'interval', repeat: 2, onDuration: 60, onPower: 1, offDuration: 0, offPower: 0.5 },
      ],
      textEvents: [],
    })
    expect(workout.segments.map((s) => s.label)).toEqual(['Interval 1/2 on', 'Interval 2/2 on'])
  })

  it('falls back to a default name', () => {
    expect(
      documentToWorkout({ name: '  ', blocks: [defaultBlock('steady')], textEvents: [] }).name,
    ).toBe('Untitled workout')
  })
})

describe('moveItem', () => {
  it('moves an item forward and backward', () => {
    expect(moveItem(['a', 'b', 'c', 'd'], 0, 2)).toEqual(['b', 'c', 'a', 'd'])
    expect(moveItem(['a', 'b', 'c', 'd'], 3, 1)).toEqual(['a', 'd', 'b', 'c'])
  })

  it('clamps the target index and ignores unknown sources', () => {
    expect(moveItem(['a', 'b'], 0, 10)).toEqual(['b', 'a'])
    expect(moveItem(['a', 'b'], 5, 0)).toEqual(['a', 'b'])
  })
})

describe('blockErrors', () => {
  const kinds: BlockKind[] = [
    'steady',
    'warmup',
    'cooldown',
    'ramp',
    'interval',
    'freeride',
    'maxeffort',
  ]

  it('accepts every default block', () => {
    for (const kind of kinds) expect(blockErrors(defaultBlock(kind))).toEqual([])
  })

  it('limits warmup and cooldown to 30 min', () => {
    const warmup = { kind: 'warmup', duration: 30 * 60, powerStart: 0.5, powerEnd: 0.7 } as const
    expect(blockErrors(warmup)).toEqual([])
    expect(blockErrors({ ...warmup, duration: 30 * 60 + 1 })).toEqual([
      'Duration must be at most 30 min.',
    ])
    expect(blockErrors({ ...warmup, kind: 'cooldown', duration: 31 * 60 })).toHaveLength(1)
  })

  it('limits steady to 12 hours', () => {
    const steady = { kind: 'steady', duration: 12 * 3600, power: 0.7 } as const
    expect(blockErrors(steady)).toEqual([])
    expect(blockErrors({ ...steady, duration: 12 * 3600 + 1 })).toEqual([
      'Duration must be at most 12 h.',
    ])
  })

  it('limits intervals to 20 repeats of 30 min steps', () => {
    const interval: Block = {
      kind: 'interval',
      repeat: LIMITS.intervalRepeat,
      onDuration: 30 * 60,
      onPower: 1.1,
      offDuration: 30 * 60,
      offPower: 0.5,
    }
    expect(blockErrors(interval)).toEqual([])
    expect(
      blockErrors({ ...interval, repeat: 21, onDuration: 30 * 60 + 1, offDuration: 31 * 60 }),
    ).toEqual([
      'Repeat must be at most 20.',
      'On must be at most 30 min.',
      'Off must be at most 30 min.',
    ])
  })

  it('rejects empty durations and powers, but allows no interval rest', () => {
    const interval: Block = {
      kind: 'interval',
      repeat: 5,
      onDuration: 60,
      onPower: 1.1,
      offDuration: 0,
      offPower: 0.5,
    }
    expect(blockErrors({ kind: 'steady', duration: 0, power: 0 })).toHaveLength(2)
    expect(blockErrors(interval)).toEqual([])
    expect(blockErrors({ ...interval, repeat: 0 })).toEqual(['Repeat must be at least 1.'])
  })
})
