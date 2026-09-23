import type { Segment } from '../workout'

/** Coggan power zones, as fractions of FTP. */
const ZONES = [
  { max: 0.55, color: 'var(--z1)', name: 'Z1' },
  { max: 0.75, color: 'var(--z2)', name: 'Z2' },
  { max: 0.9, color: 'var(--z3)', name: 'Z3' },
  { max: 1.05, color: 'var(--z4)', name: 'Z4' },
  { max: 1.2, color: 'var(--z5)', name: 'Z5' },
  { max: Infinity, color: 'var(--z6)', name: 'Z6' },
]

export function zoneFor(power: number) {
  return ZONES.find((z) => power < z.max) ?? ZONES[ZONES.length - 1]!
}

export function segmentColor(segment: Segment): string {
  switch (segment.kind) {
    case 'steady':
      return zoneFor(segment.power).color
    case 'ramp':
      return zoneFor((segment.powerStart + segment.powerEnd) / 2).color
    case 'free':
      return 'var(--free)'
  }
}

export function describePower(segment: Segment, ftp?: number): string {
  const pct = (p: number) => `${Math.round(p * 100)}%`
  const watts = (p: number) => (ftp ? ` (${Math.round(p * ftp)} W)` : '')
  switch (segment.kind) {
    case 'steady':
      return `${pct(segment.power)}${watts(segment.power)}`
    case 'ramp':
      return `${pct(segment.powerStart)} → ${pct(segment.powerEnd)}${
        ftp
          ? ` (${Math.round(segment.powerStart * ftp)} → ${Math.round(segment.powerEnd * ftp)} W)`
          : ''
      }`
    case 'free':
      return 'Free ride (ERG off)'
  }
}
