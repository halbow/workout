import { afterEach, describe, expect, it, vi } from 'vitest'
import { ControlPointQueue } from '../control-point-queue'
import { encodeRequestControl, encodeSetTargetPower } from '../codec'

const response = (opCode: number, result = 0x01) =>
  new DataView(new Uint8Array([0x80, opCode, result]).buffer)
const flush = () => new Promise((r) => setTimeout(r, 0))

afterEach(() => vi.useRealTimers())

describe('ControlPointQueue', () => {
  it('sends one command at a time and waits for its response', async () => {
    const writes: number[][] = []
    const queue = new ControlPointQueue(async (c) => void writes.push(Array.from(c)))

    const first = queue.send(encodeRequestControl())
    const second = queue.send(encodeSetTargetPower(200))
    await flush()
    expect(writes).toEqual([[0x00]])

    queue.handleIndication(response(0x05)) // not the in-flight command: ignored
    queue.handleIndication(response(0x00))
    await expect(first).resolves.toBe(0x01)
    await flush()
    expect(writes).toEqual([[0x00], [0x05, 0xc8, 0x00]])

    queue.handleIndication(response(0x05, 0x03))
    await expect(second).resolves.toBe(0x03)
  })

  it('times out and moves on to the next command', async () => {
    vi.useFakeTimers()
    const writes: number[][] = []
    const queue = new ControlPointQueue(async (c) => void writes.push(Array.from(c)), 1000)
    const first = queue.send(encodeRequestControl())
    const second = queue.send(encodeSetTargetPower(100))
    const firstResult = expect(first).rejects.toThrow(/did not answer/)
    await vi.advanceTimersByTimeAsync(1000)
    await firstResult
    expect(writes).toHaveLength(2)
    queue.handleIndication(response(0x05))
    await expect(second).resolves.toBe(0x01)
  })

  it('rejects when the write fails', async () => {
    const queue = new ControlPointQueue(async () => {
      throw new Error('GATT operation failed')
    })
    await expect(queue.send(encodeRequestControl())).rejects.toThrow('GATT operation failed')
  })

  it('rejects pending and later commands after close', async () => {
    const queue = new ControlPointQueue(async () => {})
    const pending = queue.send(encodeRequestControl())
    await flush()
    queue.close()
    await expect(pending).rejects.toThrow(/disconnected/)
    await expect(queue.send(encodeRequestControl())).rejects.toThrow(/disconnected/)
  })
})
