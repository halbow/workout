import type { Segment, TextEvent, Workout } from './types'

export class ZwoParseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ZwoParseError'
  }
}

export interface ParseOptions {
  /** Called for recoverable problems, e.g. an unknown element that was skipped. */
  onWarning?: (message: string) => void
}

const DEFAULT_TEXT_EVENT_DURATION = 10

/** Parses a Zwift workout file (`.zwo`). Throws `ZwoParseError` on invalid input. */
export function parseZwo(xml: string, options: ParseOptions = {}): Workout {
  const warn = options.onWarning ?? (() => {})
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  if (doc.getElementsByTagName('parsererror').length > 0) {
    throw new ZwoParseError('The file is not valid XML.')
  }

  const root = doc.documentElement
  if (!root || root.tagName.toLowerCase() !== 'workout_file') {
    throw new ZwoParseError('Missing <workout_file> root element.')
  }

  const sportType = childText(root, 'sportType')
  if (sportType && sportType.toLowerCase() !== 'bike') {
    throw new ZwoParseError(
      `Unsupported sport type "${sportType}", only bike workouts are supported.`,
    )
  }

  const workoutEl = childElements(root).find((el) => el.tagName.toLowerCase() === 'workout')
  if (!workoutEl) throw new ZwoParseError('Missing <workout> element.')

  const segments: Segment[] = []
  const textEvents: TextEvent[] = []
  let time = 0

  for (const el of childElements(workoutEl)) {
    const tag = el.tagName.toLowerCase()
    if (tag === 'textevent') {
      // Top-level text events use absolute offsets.
      pushTextEvent(textEvents, el, 0)
      continue
    }

    const parsed = parseElement(el, tag, warn)
    if (!parsed) continue

    for (const textEl of childElements(el)) {
      if (textEl.tagName.toLowerCase() === 'textevent') pushTextEvent(textEvents, textEl, time)
    }
    for (const segment of parsed) {
      segments.push(segment)
      time += segment.duration
    }
  }

  if (segments.length === 0) throw new ZwoParseError('The workout has no steps.')

  textEvents.sort((a, b) => a.offset - b.offset)
  return {
    name: childText(root, 'name') || 'Untitled workout',
    author: childText(root, 'author') || undefined,
    description: childText(root, 'description') || undefined,
    segments,
    textEvents,
  }
}

function parseElement(el: Element, tag: string, warn: (m: string) => void): Segment[] | undefined {
  const where = `<${el.tagName}>`
  switch (tag) {
    case 'steadystate':
    case 'solidstate': {
      const duration = requirePositive(el, 'Duration', where)
      if (duration === undefined) return skipZero(where, warn)
      const power =
        numberAttr(el, 'Power') ?? average(numberAttr(el, 'PowerLow'), numberAttr(el, 'PowerHigh'))
      if (power === undefined) throw new ZwoParseError(`${where} is missing the Power attribute.`)
      return [{ kind: 'steady', duration, power, cadence: cadence(el), label: 'Steady' }]
    }
    case 'warmup':
    case 'cooldown':
    case 'ramp': {
      const duration = requirePositive(el, 'Duration', where)
      if (duration === undefined) return skipZero(where, warn)
      // Keep the attribute order as written: some cooldowns have PowerLow > PowerHigh.
      const powerStart = requireNumber(el, 'PowerLow', where)
      const powerEnd = requireNumber(el, 'PowerHigh', where)
      const label = tag === 'warmup' ? 'Warmup' : tag === 'cooldown' ? 'Cooldown' : 'Ramp'
      return [{ kind: 'ramp', duration, powerStart, powerEnd, cadence: cadence(el), label }]
    }
    case 'intervalst': {
      const repeat = Math.round(numberAttr(el, 'Repeat') ?? 1)
      const onDuration = requireNumber(el, 'OnDuration', where)
      const offDuration = requireNumber(el, 'OffDuration', where)
      const onPower = numberAttr(el, 'OnPower') ?? requireNumber(el, 'PowerOnHigh', where)
      const offPower = numberAttr(el, 'OffPower') ?? requireNumber(el, 'PowerOffHigh', where)
      const onCadence = numberAttr(el, 'Cadence')
      const offCadence = numberAttr(el, 'CadenceResting')
      if (repeat < 1) return skipZero(where, warn)

      const out: Segment[] = []
      for (let i = 1; i <= repeat; i++) {
        const group = `Interval ${i}/${repeat}`
        if (onDuration > 0) {
          out.push({
            kind: 'steady',
            duration: onDuration,
            power: onPower,
            cadence: onCadence,
            label: `${group} on`,
          })
        }
        if (offDuration > 0) {
          out.push({
            kind: 'steady',
            duration: offDuration,
            power: offPower,
            cadence: offCadence,
            label: `${group} off`,
          })
        }
      }
      return out.length > 0 ? out : skipZero(where, warn)
    }
    case 'freeride':
    case 'maxeffort': {
      const duration = requirePositive(el, 'Duration', where)
      if (duration === undefined) return skipZero(where, warn)
      const label = tag === 'freeride' ? 'Free ride' : 'Max effort'
      return [{ kind: 'free', duration, cadence: cadence(el), label }]
    }
    default:
      warn(`Skipped unknown element ${where}.`)
      return undefined
  }
}

function pushTextEvent(out: TextEvent[], el: Element, base: number) {
  const message = attr(el, 'message')
  if (!message) return
  out.push({
    offset: base + (numberAttr(el, 'timeoffset') ?? 0),
    message,
    duration: numberAttr(el, 'duration') ?? DEFAULT_TEXT_EVENT_DURATION,
  })
}

function skipZero(where: string, warn: (m: string) => void): undefined {
  warn(`Skipped ${where} with a zero duration.`)
  return undefined
}

function cadence(el: Element): number | undefined {
  return numberAttr(el, 'Cadence')
}

function average(a: number | undefined, b: number | undefined): number | undefined {
  if (a === undefined || b === undefined) return a ?? b
  return (a + b) / 2
}

function requireNumber(el: Element, name: string, where: string): number {
  const value = numberAttr(el, name)
  if (value === undefined) throw new ZwoParseError(`${where} is missing the ${name} attribute.`)
  return value
}

/** Returns undefined for a zero duration so the caller can skip the element. */
function requirePositive(el: Element, name: string, where: string): number | undefined {
  const value = requireNumber(el, name, where)
  if (value < 0) throw new ZwoParseError(`${where} has a negative ${name}.`)
  return value === 0 ? undefined : value
}

/** Attribute lookup is case-insensitive: real-world files mix `Duration` and `duration`. */
function attr(el: Element, name: string): string | undefined {
  const lower = name.toLowerCase()
  for (const a of Array.from(el.attributes)) {
    if (a.name.toLowerCase() === lower) return a.value
  }
  return undefined
}

function numberAttr(el: Element, name: string): number | undefined {
  const raw = attr(el, name)
  if (raw === undefined || raw.trim() === '') return undefined
  const value = Number(raw)
  if (!Number.isFinite(value)) {
    throw new ZwoParseError(`<${el.tagName}> has an invalid ${name} value "${raw}".`)
  }
  return value
}

function childElements(el: Element): Element[] {
  return Array.from(el.children)
}

function childText(el: Element, tag: string): string {
  const lower = tag.toLowerCase()
  const child = childElements(el).find((c) => c.tagName.toLowerCase() === lower)
  return child?.textContent?.trim() ?? ''
}
