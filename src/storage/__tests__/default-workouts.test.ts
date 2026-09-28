import { describe, expect, it } from 'vitest'
import { parseZwo } from '../../workout'
import ftpTest from '../default-workouts/ftp-test.zwo?raw'
import rampTest from '../default-workouts/ramp-test.zwo?raw'
import recovery from '../default-workouts/recovery.zwo?raw'
import sweetSpot from '../default-workouts/sweet-spot.zwo?raw'
import vo2max from '../default-workouts/vo2max.zwo?raw'
import zone2 from '../default-workouts/zone-2.zwo?raw'

describe('default workouts', () => {
  it.each(Object.entries({ rampTest, ftpTest, recovery, zone2, sweetSpot, vo2max }))(
    '%s parses without warnings',
    (_, zwo) => {
      const warnings: string[] = []
      const workout = parseZwo(zwo, { onWarning: (w) => warnings.push(w) })
      expect(warnings).toEqual([])
      expect(workout.segments.length).toBeGreaterThan(0)
    },
  )

  it('keeps recovery and zone 2 targets below zone 3', () => {
    for (const zwo of [recovery, zone2]) {
      for (const s of parseZwo(zwo).segments) {
        const top =
          s.kind === 'steady' ? s.power : s.kind === 'ramp' ? Math.max(s.powerStart, s.powerEnd) : 0
        expect(top).toBeLessThan(0.75)
      }
    }
  })
})
