/** Pure encode/decode of FTMS bytes. No Web Bluetooth here, so it can be unit-tested. */

export const OpCode = {
  RequestControl: 0x00,
  Reset: 0x01,
  SetTargetPower: 0x05,
  StartOrResume: 0x07,
  StopOrPause: 0x08,
  Response: 0x80,
} as const

export const ResultCode = {
  Success: 0x01,
  OpCodeNotSupported: 0x02,
  InvalidParameter: 0x03,
  OperationFailed: 0x04,
  ControlNotPermitted: 0x05,
} as const

export type Command = Uint8Array<ArrayBuffer>

export const encodeRequestControl = (): Command => new Uint8Array([OpCode.RequestControl])
export const encodeReset = (): Command => new Uint8Array([OpCode.Reset])
export const encodeStartOrResume = (): Command => new Uint8Array([OpCode.StartOrResume])
export const encodeStopOrPause = (kind: 'stop' | 'pause'): Command =>
  new Uint8Array([OpCode.StopOrPause, kind === 'stop' ? 1 : 2])

/** Target power is a sint16, little-endian, in watts. */
export function encodeSetTargetPower(watts: number): Command {
  const bytes = new Uint8Array(3)
  const view = new DataView(bytes.buffer)
  view.setUint8(0, OpCode.SetTargetPower)
  view.setInt16(1, Math.max(-32768, Math.min(32767, Math.round(watts))), true)
  return bytes
}

export interface ControlPointResponse {
  requestOpCode: number
  result: number
}

export function decodeControlPointResponse(view: DataView): ControlPointResponse | undefined {
  if (view.byteLength < 3 || view.getUint8(0) !== OpCode.Response) return undefined
  return { requestOpCode: view.getUint8(1), result: view.getUint8(2) }
}

export function describeResult(result: number): string {
  switch (result) {
    case ResultCode.Success:
      return 'success'
    case ResultCode.OpCodeNotSupported:
      return 'command not supported'
    case ResultCode.InvalidParameter:
      return 'invalid parameter'
    case ResultCode.OperationFailed:
      return 'operation failed'
    case ResultCode.ControlNotPermitted:
      return 'control not permitted'
    default:
      return `unknown result 0x${result.toString(16)}`
  }
}

export interface IndoorBikeData {
  /** km/h */
  speed?: number
  /** rpm */
  cadence?: number
  /** watts */
  power?: number
  heartRate?: number
}

/**
 * Indoor Bike Data (0x2AD2). A uint16 flags field says which fields follow, in this order.
 * Bit 0 is inverted: 0 means instantaneous speed is present.
 */
export function decodeIndoorBikeData(view: DataView): IndoorBikeData {
  const flags = view.getUint16(0, true)
  const has = (bit: number) => (flags & (1 << bit)) !== 0
  const out: IndoorBikeData = {}
  let o = 2

  if (!has(0)) {
    out.speed = view.getUint16(o, true) / 100
    o += 2
  }
  if (has(1)) o += 2 // average speed
  if (has(2)) {
    out.cadence = view.getUint16(o, true) / 2
    o += 2
  }
  if (has(3)) o += 2 // average cadence
  if (has(4)) o += 3 // total distance (uint24)
  if (has(5)) o += 2 // resistance level
  if (has(6)) {
    out.power = view.getInt16(o, true)
    o += 2
  }
  if (has(7)) o += 2 // average power
  if (has(8)) o += 5 // expended energy: total, per hour, per minute
  if (has(9)) out.heartRate = view.getUint8(o)
  return out
}

export interface FitnessMachineFeatures {
  powerTargetSupported: boolean
}

/** Fitness Machine Feature (0x2ACC): two uint32, machine features then target setting features. */
export function decodeFeatures(view: DataView): FitnessMachineFeatures {
  const targetSettings = view.byteLength >= 8 ? view.getUint32(4, true) : 0
  return { powerTargetSupported: (targetSettings & (1 << 3)) !== 0 }
}

export const MachineStatus = {
  Reset: 0x01,
  StoppedOrPaused: 0x02,
  Started: 0x04,
  TargetPowerChanged: 0x08,
  ControlPermissionLost: 0xff,
} as const

/** Fitness Machine Status (0x2ADA): the first byte is the status op code. */
export function decodeMachineStatus(view: DataView): number | undefined {
  return view.byteLength > 0 ? view.getUint8(0) : undefined
}

/** Fitness Machine Feature bits, in bit order. */
export const MACHINE_FEATURES = [
  'Average speed',
  'Cadence',
  'Total distance',
  'Inclination',
  'Elevation gain',
  'Pace',
  'Step count',
  'Resistance level',
  'Stride count',
  'Expended energy',
  'Heart rate',
  'Metabolic equivalent',
  'Elapsed time',
  'Remaining time',
  'Power measurement',
  'Force on belt and power output',
  'User data retention',
] as const

/** Target Setting Feature bits, in bit order. */
export const TARGET_SETTING_FEATURES = [
  'Speed target',
  'Inclination target',
  'Resistance target',
  'Power target (ERG)',
  'Heart rate target',
  'Targeted expended energy',
  'Targeted step number',
  'Targeted stride number',
  'Targeted distance',
  'Targeted training time',
  'Targeted time in two HR zones',
  'Targeted time in three HR zones',
  'Targeted time in five HR zones',
  'Indoor bike simulation (SIM)',
  'Wheel circumference',
  'Spin down control',
  'Targeted cadence',
] as const

export interface FeatureFlag {
  name: string
  supported: boolean
}

export interface FeatureList {
  machine: FeatureFlag[]
  targetSettings: FeatureFlag[]
}

/** Every bit of Fitness Machine Feature (0x2ACC), named. */
export function decodeFeatureList(view: DataView): FeatureList {
  const word = (offset: number) =>
    view.byteLength >= offset + 4 ? view.getUint32(offset, true) : 0
  const flags = (names: readonly string[], bits: number) =>
    names.map((name, bit) => ({ name, supported: (bits & (1 << bit)) !== 0 }))
  return {
    machine: flags(MACHINE_FEATURES, word(0)),
    targetSettings: flags(TARGET_SETTING_FEATURES, word(4)),
  }
}

export interface SupportedRange {
  min: number
  max: number
  increment: number
}

/**
 * Supported Power Range (0x2AD8, watts) and Supported Resistance Level Range (0x2AD6,
 * unitless, in tenths: pass `10`): sint16 min, sint16 max, uint16 increment.
 */
export function decodeSupportedRange(view: DataView, divisor = 1): SupportedRange | undefined {
  if (view.byteLength < 6) return undefined
  return {
    min: view.getInt16(0, true) / divisor,
    max: view.getInt16(2, true) / divisor,
    increment: view.getUint16(4, true) / divisor,
  }
}
