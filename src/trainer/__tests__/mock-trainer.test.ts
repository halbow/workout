import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MockTrainer } from '../mock-trainer'
import type { TrainerEvent } from '../types'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('MockTrainer', () => {
  it('connects, takes control and follows the target power', async () => {
    const trainer = new MockTrainer({ random: () => 0.5, connectDelayMs: 0 })
    const events: TrainerEvent[] = []
    trainer.subscribe((e) => events.push(e))

    await trainer.connect()
    expect(trainer.status).toBe('controlling')
    await trainer.setTargetPower(200)
    await vi.advanceTimersByTimeAsync(10_000)

    const last = events.filter((e) => e.type === 'data').at(-1)
    expect(last?.type === 'data' && last.data.power).toBeCloseTo(200, -1)
    expect(last?.type === 'data' && last.data.cadence).toBe(90)
  })

  it('goes back to connected when control is released', async () => {
    const trainer = new MockTrainer({ connectDelayMs: 0 })
    await trainer.connect()
    await trainer.releaseControl()
    expect(trainer.status).toBe('connected')
    await trainer.setTargetPower(150)
    expect(trainer.status).toBe('controlling')
    expect(trainer.commands).toEqual([
      { type: 'releaseControl' },
      { type: 'setTargetPower', watts: 150 },
    ])
  })

  it('emits a disconnected status on a simulated dropout and rejects commands', async () => {
    const trainer = new MockTrainer({ connectDelayMs: 0 })
    const statuses: string[] = []
    trainer.subscribe((e) => e.type === 'status' && statuses.push(e.status))
    await trainer.connect()
    trainer.simulateDisconnect()
    expect(statuses).toEqual(['connecting', 'controlling', 'disconnected'])
    await expect(trainer.setTargetPower(100)).rejects.toThrow(/not connected/)
  })
})
