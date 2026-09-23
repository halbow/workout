export interface Clock {
  /** Monotonic time in ms. */
  now(): number
  /** Calls `fn` every `ms` milliseconds. Returns a function that cancels it. */
  every(ms: number, fn: () => void): () => void
}

export const realClock: Clock = {
  now: () => performance.now(),
  every(ms, fn) {
    const id = setInterval(fn, ms)
    return () => clearInterval(id)
  },
}

interface FakeTimer {
  ms: number
  next: number
  fn: () => void
}

/** A manually advanced clock for tests. */
export class FakeClock implements Clock {
  private time = 0
  private timers = new Set<FakeTimer>()

  now() {
    return this.time
  }

  every(ms: number, fn: () => void) {
    const timer = { ms, next: this.time + ms, fn }
    this.timers.add(timer)
    return () => void this.timers.delete(timer)
  }

  /** Moves time forward, firing due timers in order. */
  advance(ms: number) {
    const end = this.time + ms
    for (;;) {
      let due: FakeTimer | undefined
      for (const t of this.timers) if (t.next <= end && (!due || t.next < due.next)) due = t
      if (!due) break
      this.time = due.next
      due.next += due.ms
      due.fn()
    }
    this.time = end
  }
}
