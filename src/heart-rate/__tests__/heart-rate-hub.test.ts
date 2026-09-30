import { describe, expect, it, vi } from 'vitest'
import { HeartRateHub } from '../heart-rate-hub'

describe('HeartRateHub', () => {
  it('has no value without readings', () => {
    expect(new HeartRateHub().current(0)).toBeUndefined()
  })

  it('prefers the sensor over the trainer', () => {
    const hub = new HeartRateHub()
    hub.push('trainer', { bpm: 120, timestamp: 1000 })
    expect(hub.current(1000)).toBe(120)
    hub.push('sensor', { bpm: 130, timestamp: 1000 })
    hub.push('trainer', { bpm: 125, timestamp: 1500 })
    expect(hub.current(1500)).toBe(130)
  })

  it('falls back to the trainer when the sensor goes quiet', () => {
    const hub = new HeartRateHub(5000)
    hub.push('sensor', { bpm: 130, timestamp: 0 })
    hub.push('trainer', { bpm: 125, timestamp: 4000 })
    expect(hub.current(5000)).toBe(130)
    expect(hub.current(5001)).toBe(125)
    expect(hub.current(9001)).toBeUndefined()
  })

  it('notifies listeners on every reading', () => {
    const hub = new HeartRateHub()
    const listener = vi.fn()
    const unsubscribe = hub.subscribe(listener)
    hub.push('sensor', { bpm: 130, timestamp: 0 })
    unsubscribe()
    hub.push('sensor', { bpm: 131, timestamp: 1 })
    expect(listener).toHaveBeenCalledTimes(1)
  })
})
