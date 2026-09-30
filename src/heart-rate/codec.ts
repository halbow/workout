/**
 * Heart Rate Measurement (0x2A37). Flags bit 0 says the format of the value that follows:
 * 0 → uint8, 1 → uint16 LE. The other fields (energy expended, RR intervals) are ignored.
 */
export function decodeHeartRateMeasurement(view: DataView): number {
  const flags = view.getUint8(0)
  return flags & 0x01 ? view.getUint16(1, true) : view.getUint8(1)
}
