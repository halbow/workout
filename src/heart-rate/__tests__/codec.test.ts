import { describe, expect, it } from 'vitest'
import { decodeHeartRateMeasurement } from '../codec'

const view = (...bytes: number[]) => new DataView(new Uint8Array(bytes).buffer)

describe('decodeHeartRateMeasurement', () => {
  it('reads a uint8 value when flags bit 0 is 0', () => {
    expect(decodeHeartRateMeasurement(view(0x00, 72))).toBe(72)
  })

  it('reads a uint16 LE value when flags bit 0 is 1', () => {
    expect(decodeHeartRateMeasurement(view(0x01, 0x2c, 0x01))).toBe(300)
  })

  it('ignores the RR intervals that follow', () => {
    // Flags: uint8 HR, sensor contact, RR intervals present.
    expect(decodeHeartRateMeasurement(view(0x16, 142, 0x00, 0x04, 0x10, 0x04))).toBe(142)
  })

  it('throws on a truncated packet', () => {
    expect(() => decodeHeartRateMeasurement(view(0x01, 0x2c))).toThrow()
  })
})
