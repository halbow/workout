import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MockTrainer } from '../../trainer/mock-trainer'
import type { Workout } from '../../workout'
import { FakeClock } from '../clock'
import { WorkoutRunner } from '../workout-runner'

const FTP = 200

const workout: Workout = {
  name: 'Test',
  segments: [
    { kind: 'steady', duration: 10, power: 0.5 }, // 0–10 s, 100 W
    { kind: 'steady', duration: 10, power: 1.0 }, // 10–20 s, 200 W
    { kind: 'ramp', duration: 20, powerStart: 0.5, powerEnd: 1.0 }, // 20–40 s, 100 → 200 W
    { kind: 'free', duration: 10 }, // 40–50 s
    { kind: 'steady', duration: 10, power: 0.6 }, // 50–60 s, 120 W
  ],
  textEvents: [{ offset: 12, message: 'Go!', duration: 5 }],
}

let clock: FakeClock
let trainer: MockTrainer
let runner: WorkoutRunner
let detach: () => void

beforeEach(async () => {
  vi.useFakeTimers()
  clock = new FakeClock()
  trainer = new MockTrainer({ connectDelayMs: 0, tickMs: 60_000 })
  await trainer.connect()
  runner = new WorkoutRunner({ workout, trainer, ftp: FTP, clock })
  detach = runner.attach()
})

afterEach(() => {
  detach()
  vi.useRealTimers()
})

const targets = () =>
  trainer.commands.map((c) => (c.type === 'setTargetPower' ? c.watts : 'release'))

describe('WorkoutRunner', () => {
  it('starts idle and sends the first target on start', () => {
    expect(runner.getSnapshot().state).toBe('idle')
    runner.start()
    expect(runner.getSnapshot()).toMatchObject({
      state: 'running',
      segmentIndex: 0,
      targetPower: 100,
    })
    expect(targets()).toEqual([100])
  })

  it('sends new targets at segment boundaries', () => {
    runner.start()
    clock.advance(9_750)
    expect(targets()).toEqual([100])
    clock.advance(250)
    expect(targets()).toEqual([100, 200])
    expect(runner.getSnapshot()).toMatchObject({
      segmentIndex: 1,
      segmentElapsed: 0,
      segmentRemaining: 10,
    })
    expect(runner.getSnapshot().nextSegment).toBe(workout.segments[2])
  })

  it('throttles ramp targets to 5 W steps at most once per second', () => {
    runner.start()
    clock.advance(19_750)
    trainer.commands.length = 0
    const sentAt: number[] = []
    let count = 0
    for (let t = 0; t < 20_000; t += 250) {
      clock.advance(250)
      if (trainer.commands.length > count) {
        count = trainer.commands.length
        sentAt.push(clock.now())
      }
    }
    const watts = targets().filter((w): w is number => typeof w === 'number')
    expect(watts.every((w) => w % 5 === 0)).toBe(true)
    expect(watts[0]).toBe(100)
    expect(watts.at(-1)).toBeGreaterThanOrEqual(195)
    for (let i = 1; i < sentAt.length; i++) {
      expect(sentAt[i]! - sentAt[i - 1]!).toBeGreaterThanOrEqual(1000)
    }
    expect(new Set(watts).size).toBe(watts.length)
  })

  it('freezes elapsed time while paused and sends a low target', () => {
    runner.start()
    clock.advance(5_000)
    runner.pause()
    expect(runner.getSnapshot()).toMatchObject({ state: 'paused', pauseReason: 'user', elapsed: 5 })
    expect(targets().at(-1)).toBe(FTP * 0.5)

    clock.advance(60_000)
    expect(runner.getSnapshot().elapsed).toBe(5)

    runner.resume()
    expect(targets().at(-1)).toBe(100)
    clock.advance(2_000)
    expect(runner.getSnapshot()).toMatchObject({ state: 'running', elapsed: 7, remaining: 53 })
  })

  it('releases control once in free segments and takes it back on exit', () => {
    runner.start()
    clock.advance(40_000)
    expect(targets().at(-1)).toBe('release')
    expect(runner.getSnapshot().targetPower).toBeUndefined()
    clock.advance(9_750)
    expect(targets().filter((c) => c === 'release')).toHaveLength(1)
    clock.advance(250)
    expect(targets().at(-1)).toBe(120)
  })

  it('releases control again when resuming inside a free segment', () => {
    runner.start()
    clock.advance(42_000)
    runner.pause()
    runner.resume()
    expect(targets().slice(-3)).toEqual(['release', 100, 'release'])
  })

  it('finishes at the end of the workout and releases control', () => {
    runner.start()
    clock.advance(60_000)
    expect(runner.getSnapshot()).toMatchObject({ state: 'finished', elapsed: 60, remaining: 0 })
    expect(targets().at(-1)).toBe('release')
    const count = trainer.commands.length
    clock.advance(10_000)
    expect(trainer.commands).toHaveLength(count)
  })

  it('stops on request and releases control', () => {
    runner.start()
    clock.advance(3_000)
    runner.stop()
    expect(runner.getSnapshot()).toMatchObject({ state: 'stopped', elapsed: 3 })
    expect(targets().at(-1)).toBe('release')
    runner.resume()
    expect(runner.getSnapshot().state).toBe('stopped')
  })

  it('pauses automatically when the trainer disconnects', () => {
    runner.start()
    clock.advance(4_000)
    trainer.simulateDisconnect()
    expect(runner.getSnapshot()).toMatchObject({
      state: 'paused',
      pauseReason: 'trainer-disconnected',
      elapsed: 4,
    })
    clock.advance(10_000)
    expect(runner.getSnapshot().elapsed).toBe(4)
  })

  it('resends the target after a reconnect and resume', async () => {
    runner.start()
    clock.advance(12_000)
    trainer.simulateDisconnect()
    await trainer.reconnect()
    runner.resume()
    expect(targets().at(-1)).toBe(200)
  })

  it('ignores invalid transitions', () => {
    runner.pause()
    runner.resume()
    runner.stop()
    expect(runner.getSnapshot().state).toBe('idle')
  })

  it('exposes the active text event and live trainer data', async () => {
    const listener = vi.fn()
    runner.subscribe(listener)
    runner.start()
    clock.advance(13_000)
    expect(runner.getSnapshot().activeTextEvent?.message).toBe('Go!')
    await vi.advanceTimersByTimeAsync(60_000) // one mock trainer data tick
    expect(runner.getSnapshot().live.power).toBeGreaterThan(0)
    expect(listener).toHaveBeenCalled()
  })

  it('keeps the same snapshot object until something changes', () => {
    const a = runner.getSnapshot()
    expect(runner.getSnapshot()).toBe(a)
    runner.start()
    expect(runner.getSnapshot()).not.toBe(a)
  })
})
