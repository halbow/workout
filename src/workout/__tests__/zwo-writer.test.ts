import { describe, expect, it } from 'vitest'
import type { ZwoDocument } from '../blocks'
import { parseZwo, parseZwoDocument } from '../zwo-parser'
import { serializeZwo } from '../zwo-writer'
import allElements from './fixtures/all-elements.zwo?raw'
import realWorld from './fixtures/real-world.zwo?raw'

describe('serializeZwo', () => {
  it.each([
    ['all-elements', allElements],
    ['real-world', realWorld],
  ])('round-trips the %s fixture', (_, xml) => {
    const doc = parseZwoDocument(xml)
    const written = serializeZwo(doc)
    expect(parseZwoDocument(written)).toEqual(doc)
    expect(parseZwo(written)).toEqual(parseZwo(xml))
  })

  it('nests text events in their block with relative offsets', () => {
    const xml = serializeZwo(parseZwoDocument(allElements))
    expect(xml).toContain(
      '<SteadyState Duration="300" Power="0.88" Cadence="90">\n      <textevent timeoffset="10" message="Settle in" duration="10"/>',
    )
    expect(xml).toContain('<textevent timeoffset="300" message="Second effort" duration="10"/>')
  })

  it('escapes text and omits empty metadata', () => {
    const doc: ZwoDocument = {
      name: 'Over & "under" <3',
      blocks: [{ kind: 'steady', duration: 60, power: 0.5 }],
      textEvents: [{ offset: 5, message: 'Go & go', duration: 10 }],
    }
    const xml = serializeZwo(doc)
    expect(xml).toContain('<name>Over &amp; &quot;under&quot; &lt;3</name>')
    expect(xml).not.toContain('<author>')
    expect(xml).not.toContain('Cadence')
    expect(parseZwoDocument(xml)).toEqual({ ...doc, author: undefined, description: undefined })
  })
})
