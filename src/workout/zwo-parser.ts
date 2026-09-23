import {
  blockDuration,
  blockToSegments,
  documentToWorkout,
  type Block,
  type ZwoDocument,
} from './blocks'
import type { TextEvent, Workout } from './types'

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

/** Parses a Zwift workout file (`.zwo`) into playable segments. Throws `ZwoParseError`. */
export function parseZwo(xml: string, options: ParseOptions = {}): Workout {
  return documentToWorkout(parseZwoDocument(xml, options))
}

/** Parses a Zwift workout file (`.zwo`) into editable blocks. Throws `ZwoParseError`. */
export function parseZwoDocument(xml: string, options: ParseOptions = {}): ZwoDocument {
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

  const blocks: Block[] = []
  const textEvents: TextEvent[] = []
  let time = 0

  for (const el of childElements(workoutEl)) {
    const tag = el.tagName.toLowerCase()
    if (tag === 'textevent') {
      // Top-level text events use absolute offsets.
      pushTextEvent(textEvents, el, 0)
      continue
    }

    const block = parseElement(el, tag, warn)
    if (!block) continue
    if (blockDuration(block) === 0 || blockToSegments(block).length === 0) {
      warn(`Skipped <${el.tagName}> with a zero duration.`)
      continue
    }

    for (const textEl of childElements(el)) {
      if (textEl.tagName.toLowerCase() === 'textevent') pushTextEvent(textEvents, textEl, time)
    }
    blocks.push(block)
    time += blockDuration(block)
  }

  if (blocks.length === 0) throw new ZwoParseError('The workout has no steps.')

  textEvents.sort((a, b) => a.offset - b.offset)
  return {
    name: childText(root, 'name') || 'Untitled workout',
    author: childText(root, 'author') || undefined,
    description: childText(root, 'description') || undefined,
    blocks,
    textEvents,
  }
}

function parseElement(el: Element, tag: string, warn: (m: string) => void): Block | undefined {
  const where = `<${el.tagName}>`
  const cadence = numberAttr(el, 'Cadence')
  switch (tag) {
    case 'steadystate':
    case 'solidstate': {
      const duration = requireDuration(el, where)
      const power =
        numberAttr(el, 'Power') ?? average(numberAttr(el, 'PowerLow'), numberAttr(el, 'PowerHigh'))
      if (power === undefined) throw new ZwoParseError(`${where} is missing the Power attribute.`)
      return { kind: 'steady', duration, power, cadence }
    }
    case 'warmup':
    case 'cooldown':
    case 'ramp':
      return {
        kind: tag,
        duration: requireDuration(el, where),
        // Keep the attribute order as written: some cooldowns have PowerLow > PowerHigh.
        powerStart: requireNumber(el, 'PowerLow', where),
        powerEnd: requireNumber(el, 'PowerHigh', where),
        cadence,
      }
    case 'intervalst': {
      const repeat = Math.round(numberAttr(el, 'Repeat') ?? 1)
      const onDuration = requireNumber(el, 'OnDuration', where)
      const offDuration = requireNumber(el, 'OffDuration', where)
      const onPower = numberAttr(el, 'OnPower') ?? requireNumber(el, 'PowerOnHigh', where)
      const offPower = numberAttr(el, 'OffPower') ?? requireNumber(el, 'PowerOffHigh', where)
      return {
        kind: 'interval',
        repeat: Math.max(repeat, 0),
        onDuration,
        onPower,
        offDuration,
        offPower,
        cadence,
        cadenceResting: numberAttr(el, 'CadenceResting'),
      }
    }
    case 'freeride':
    case 'maxeffort':
      return { kind: tag, duration: requireDuration(el, where), cadence }
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

function average(a: number | undefined, b: number | undefined): number | undefined {
  if (a === undefined || b === undefined) return a ?? b
  return (a + b) / 2
}

function requireNumber(el: Element, name: string, where: string): number {
  const value = numberAttr(el, name)
  if (value === undefined) throw new ZwoParseError(`${where} is missing the ${name} attribute.`)
  return value
}

function requireDuration(el: Element, where: string): number {
  const value = requireNumber(el, 'Duration', where)
  if (value < 0) throw new ZwoParseError(`${where} has a negative Duration.`)
  return value
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
