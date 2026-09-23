import { describe, expect, it } from 'vitest'
import {
  decodeControlPointResponse,
  decodeFeatures,
  decodeIndoorBikeData,
  decodeMachineStatus,
  encodeRequestControl,
  encodeReset,
  encodeSetTargetPower,
  encodeStartOrResume,
  encodeStopOrPause,
} from '../codec'

const view = (...bytes: number[]) => new DataView(new Uint8Array(bytes).buffer)
const bytes = (u: Uint8Array) => Array.from(u)

describe('FTMS codec: commands', () => {
  it('encodes simple commands', () => {
    expect(bytes(encodeRequestControl())).toEqual([0x00])
    expect(bytes(encodeReset())).toEqual([0x01])
    expect(bytes(encodeStartOrResume())).toEqual([0x07])
    expect(bytes(encodeStopOrPause('stop'))).toEqual([0x08, 0x01])
    expect(bytes(encodeStopOrPause('pause'))).toEqual([0x08, 0x02])
  })

  it('encodes Set Target Power as sint16 little-endian', () => {
    expect(bytes(encodeSetTargetPower(200))).toEqual([0x05, 0xc8, 0x00])
    expect(bytes(encodeSetTargetPower(300))).toEqual([0x05, 0x2c, 0x01])
    expect(bytes(encodeSetTargetPower(1234.6))).toEqual([0x05, 0xd3, 0x04])
  })

  it('round-trips target power', () => {
    for (const watts of [0, 1, 150, 255, 256, 999, 2000]) {
      const encoded = encodeSetTargetPower(watts)
      expect(new DataView(encoded.buffer).getInt16(1, true)).toBe(watts)
    }
  })
})

describe('FTMS codec: responses and data', () => {
  it('decodes control point responses', () => {
    expect(decodeControlPointResponse(view(0x80, 0x05, 0x01))).toEqual({
      requestOpCode: 0x05,
      result: 0x01,
    })
    expect(decodeControlPointResponse(view(0x80, 0x00, 0x05))).toEqual({
      requestOpCode: 0x00,
      result: 0x05,
    })
    expect(decodeControlPointResponse(view(0x05, 0xc8, 0x00))).toBeUndefined()
    expect(decodeControlPointResponse(view(0x80))).toBeUndefined()
  })

  it('decodes Indoor Bike Data with speed, cadence and power (KICKR layout)', () => {
    // flags 0x0044: speed present (bit 0 clear), cadence (bit 2), power (bit 6)
    // speed 3050 → 30.5 km/h, cadence 180 → 90 rpm, power 250 W
    const data = decodeIndoorBikeData(view(0x44, 0x00, 0xea, 0x0b, 0xb4, 0x00, 0xfa, 0x00))
    expect(data).toEqual({ speed: 30.5, cadence: 90, power: 250 })
  })

  it('skips fields that are present but not used', () => {
    // flags: more data (no speed), avg speed, cadence, total distance, resistance, power, heart rate
    const flags = (1 << 0) | (1 << 1) | (1 << 2) | (1 << 4) | (1 << 5) | (1 << 6) | (1 << 9)
    const data = decodeIndoorBikeData(
      view(
        flags & 0xff,
        flags >> 8,
        0x10,
        0x27, // average speed
        0xa0,
        0x00, // cadence 160 → 80 rpm
        0x01,
        0x02,
        0x03, // total distance
        0x0a,
        0x00, // resistance
        0x2c,
        0x01, // power 300 W
        0x8c, // heart rate 140
      ),
    )
    expect(data).toEqual({ cadence: 80, power: 300, heartRate: 140 })
  })

  it('decodes negative power', () => {
    expect(decodeIndoorBikeData(view(0x41, 0x00, 0xfb, 0xff)).power).toBe(-5)
  })

  it('reads the power target supported flag', () => {
    expect(decodeFeatures(view(0, 0, 0, 0, 0x08, 0, 0, 0)).powerTargetSupported).toBe(true)
    expect(decodeFeatures(view(0xff, 0xff, 0, 0, 0x02, 0, 0, 0)).powerTargetSupported).toBe(false)
  })

  it('reads the machine status op code', () => {
    expect(decodeMachineStatus(view(0xff))).toBe(0xff)
    expect(decodeMachineStatus(view())).toBeUndefined()
  })
})
