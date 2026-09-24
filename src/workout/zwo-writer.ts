import { blockDuration, type Block, type ZwoDocument } from './blocks'
import type { TextEvent } from './types'

/** Writes a Zwift workout file (`.zwo`). `parseZwoDocument` reads it back unchanged. */
export function serializeZwo(doc: ZwoDocument): string {
  const lines = ['<?xml version="1.0" encoding="UTF-8"?>', '<workout_file>']
  if (doc.author) lines.push(`  <author>${escape(doc.author)}</author>`)
  lines.push(`  <name>${escape(doc.name)}</name>`)
  if (doc.description) lines.push(`  <description>${escape(doc.description)}</description>`)
  lines.push('  <sportType>bike</sportType>', '  <workout>')

  // Zwift nests text events in the element they belong to, with a relative offset.
  const nested = nestTextEvents(doc.blocks, doc.textEvents)
  doc.blocks.forEach((block, i) => {
    const [tag, attrs] = element(block)
    const open = `    <${tag}${attrs
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => ` ${k}="${v}"`)
      .join('')}`
    const events = nested[i]!
    if (events.length === 0) {
      lines.push(`${open}/>`)
      return
    }
    lines.push(`${open}>`)
    for (const e of events) {
      lines.push(
        `      <textevent timeoffset="${e.offset}" message="${escape(e.message)}" duration="${e.duration}"/>`,
      )
    }
    lines.push(`    </${tag}>`)
  })

  lines.push('  </workout>', '</workout_file>', '')
  return lines.join('\n')
}

type Attrs = [string, number | undefined][]

function element(block: Block): [string, Attrs] {
  const cadence: Attrs = [['Cadence', block.cadence]]
  switch (block.kind) {
    case 'steady':
      return ['SteadyState', [['Duration', block.duration], ['Power', block.power], ...cadence]]
    case 'warmup':
    case 'cooldown':
    case 'ramp': {
      const tag = { warmup: 'Warmup', cooldown: 'Cooldown', ramp: 'Ramp' }[block.kind]
      return [
        tag,
        [
          ['Duration', block.duration],
          ['PowerLow', block.powerStart],
          ['PowerHigh', block.powerEnd],
          ...cadence,
        ],
      ]
    }
    case 'interval':
      return [
        'IntervalsT',
        [
          ['Repeat', block.repeat],
          ['OnDuration', block.onDuration],
          ['OffDuration', block.offDuration],
          ['OnPower', block.onPower],
          ['OffPower', block.offPower],
          ...cadence,
          ['CadenceResting', block.cadenceResting],
        ],
      ]
    case 'freeride':
      return ['FreeRide', [['Duration', block.duration], ...cadence]]
    case 'maxeffort':
      return ['MaxEffort', [['Duration', block.duration], ...cadence]]
  }
}

/** Groups text events by the block they fall in, with offsets relative to that block. */
function nestTextEvents(blocks: Block[], events: TextEvent[]): TextEvent[][] {
  const out: TextEvent[][] = blocks.map(() => [])
  const starts: number[] = []
  let time = 0
  for (const block of blocks) {
    starts.push(time)
    time += blockDuration(block)
  }
  for (const event of events) {
    // Events past the end stay on the last block.
    let i = starts.findLastIndex((start) => start <= event.offset)
    if (i < 0) i = 0
    out[i]?.push({ ...event, offset: event.offset - starts[i]! })
  }
  return out
}

function escape(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
