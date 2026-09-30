import type { HeartRateReading } from './types'

/** Where a heart rate reading comes from, highest priority first. */
export const HEART_RATE_SOURCES = ['sensor', 'trainer'] as const
export type HeartRateSource = (typeof HEART_RATE_SOURCES)[number]

/** A source is dropped once its last reading is older than this. */
const MAX_AGE_MS = 5000

/**
 * Collects heart rate readings from every device that sends them and picks the one to show: the
 * highest priority source with a fresh reading, so we fall back when a sensor goes quiet.
 */
export class HeartRateHub {
  private readonly latest = new Map<HeartRateSource, HeartRateReading>()
  private readonly listeners = new Set<() => void>()

  constructor(private readonly maxAgeMs = MAX_AGE_MS) {}

  push(source: HeartRateSource, reading: HeartRateReading) {
    this.latest.set(source, reading)
    for (const listener of this.listeners) listener()
  }

  /** Beats per minute, or undefined when no source is fresh. */
  current(now = Date.now()): number | undefined {
    for (const source of HEART_RATE_SOURCES) {
      const reading = this.latest.get(source)
      if (reading && now - reading.timestamp <= this.maxAgeMs) return reading.bpm
    }
    return undefined
  }

  /** Called on every reading, from any source. */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }
}
