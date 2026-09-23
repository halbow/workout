import { describe, expect, it } from 'vitest'
import { parseZwo, ZwoParseError } from '../zwo-parser'
import { totalDuration } from '../duration'
import allElements from './fixtures/all-elements.zwo?raw'
import realWorld from './fixtures/real-world.zwo?raw'

function wrap(body: string, sportType = 'bike') {
  return `<workout_file><name>T</name><sportType>${sportType}</sportType><workout>${body}</workout></workout_file>`
}

describe('parseZwo', () => {
  it('parses metadata', () => {
    const w = parseZwo(allElements)
    expect(w.name).toBe('All elements')
    expect(w.author).toBe('Test Author')
    expect(w.description).toBe('One of each element type.')
  })

  it('maps every element type to segments in order', () => {
    const w = parseZwo(allElements)
    expect(w.segments.map((s) => s.kind)).toEqual([
      'ramp', // Warmup
      'steady',
      'steady',
      'steady',
      'steady',
      'steady',
      'steady',
      'steady', // IntervalsT x3
      'ramp', // Ramp
      'free', // FreeRide
      'free', // MaxEffort
      'ramp', // Cooldown
    ])
    expect(w.segments[0]).toMatchObject({
      kind: 'ramp',
      duration: 600,
      powerStart: 0.4,
      powerEnd: 0.75,
      label: 'Warmup',
    })
    expect(w.segments[1]).toMatchObject({ kind: 'steady', duration: 300, power: 0.88, cadence: 90 })
    expect(w.segments[8]).toMatchObject({
      kind: 'ramp',
      duration: 300,
      powerStart: 0.6,
      powerEnd: 0.9,
    })
    expect(w.segments[9]).toMatchObject({ kind: 'free', duration: 600, label: 'Free ride' })
    expect(w.segments[10]).toMatchObject({ kind: 'free', duration: 20, label: 'Max effort' })
  })

  it('keeps cooldown attribute order when PowerLow > PowerHigh', () => {
    const w = parseZwo(allElements)
    expect(w.segments.at(-1)).toMatchObject({
      kind: 'ramp',
      powerStart: 0.7,
      powerEnd: 0.4,
      label: 'Cooldown',
    })
  })

  it('flattens IntervalsT into alternating steady segments with group labels', () => {
    const w = parseZwo(allElements)
    expect(w.segments.slice(2, 8)).toEqual([
      { kind: 'steady', duration: 180, power: 1.05, cadence: 95, label: 'Interval 1/3 on' },
      { kind: 'steady', duration: 120, power: 0.55, cadence: 85, label: 'Interval 1/3 off' },
      { kind: 'steady', duration: 180, power: 1.05, cadence: 95, label: 'Interval 2/3 on' },
      { kind: 'steady', duration: 120, power: 0.55, cadence: 85, label: 'Interval 2/3 off' },
      { kind: 'steady', duration: 180, power: 1.05, cadence: 95, label: 'Interval 3/3 on' },
      { kind: 'steady', duration: 120, power: 0.55, cadence: 85, label: 'Interval 3/3 off' },
    ])
  })

  it('converts text event offsets to absolute time', () => {
    const w = parseZwo(allElements)
    expect(w.textEvents).toEqual([
      { offset: 610, message: 'Settle in', duration: 10 },
      { offset: 900, message: 'First effort', duration: 10 },
      { offset: 1200, message: 'Second effort', duration: 10 },
    ])
  })

  it('parses a real-world file with lowercase attributes and extra tags', () => {
    const warnings: string[] = []
    const w = parseZwo(realWorld, { onWarning: (m) => warnings.push(m) })
    expect(warnings).toEqual([])
    expect(w.name).toBe('The Gorby')
    expect(w.segments).toHaveLength(1 + 1 + 8 + 1 + 8 + 1)
    expect(w.segments[10]).toMatchObject({ kind: 'steady', duration: 300, power: 0.55 })
    expect(totalDuration(w)).toBe(480 + 120 + 480 + 300 + 480 + 480)
  })

  it('warns about and skips unknown elements', () => {
    const warnings: string[] = []
    const w = parseZwo(wrap('<SteadyState Duration="60" Power="0.5"/><Mystery Duration="30"/>'), {
      onWarning: (m) => warnings.push(m),
    })
    expect(w.segments).toHaveLength(1)
    expect(warnings).toEqual(['Skipped unknown element <Mystery>.'])
  })

  it('defaults a missing sportType to bike and a missing name', () => {
    const w = parseZwo(
      '<workout_file><workout><SteadyState Duration="60" Power="0.5"/></workout></workout_file>',
    )
    expect(w.name).toBe('Untitled workout')
  })

  it.each([
    ['malformed XML', '<workout_file><workout>', /not valid XML/],
    ['a wrong root element', '<foo><workout/></foo>', /workout_file/],
    ['a missing workout element', '<workout_file><name>x</name></workout_file>', /<workout>/],
    ['a run workout', wrap('<SteadyState Duration="60" Power="0.5"/>', 'run'), /sport type "run"/],
    ['an empty workout', wrap(''), /no steps/],
    ['a missing Duration', wrap('<SteadyState Power="0.5"/>'), /missing the Duration/],
    ['a missing Power', wrap('<SteadyState Duration="60"/>'), /missing the Power/],
    [
      'a missing PowerHigh on a ramp',
      wrap('<Ramp Duration="60" PowerLow="0.5"/>'),
      /missing the PowerHigh/,
    ],
    [
      'a missing OnDuration',
      wrap('<IntervalsT Repeat="2" OffDuration="60" OnPower="1" OffPower="0.5"/>'),
      /OnDuration/,
    ],
    ['a non-numeric value', wrap('<SteadyState Duration="abc" Power="0.5"/>'), /invalid Duration/],
  ])('rejects %s', (_, xml, message) => {
    expect(() => parseZwo(xml)).toThrow(ZwoParseError)
    expect(() => parseZwo(xml)).toThrow(message)
  })
})
