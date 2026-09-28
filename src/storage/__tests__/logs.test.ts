import { describe, expect, it } from 'vitest'
import type { LogEntry } from '../../logging'
import { LogRecorder, logFileName, MAX_LOG_SESSIONS, type KeyValueStore } from '../logs'

function memoryStore(): KeyValueStore & { map: Map<string, unknown> } {
  const map = new Map<string, unknown>()
  return {
    map,
    get: async <T>(key: string) => map.get(key) as T | undefined,
    set: async (key, value) => void map.set(key, value),
    del: async (key) => void map.delete(key),
  }
}

const entry = (message: string, level: LogEntry['level'] = 'info'): LogEntry => ({
  time: 0,
  level,
  scope: 'test',
  message,
})

describe('LogRecorder', () => {
  it('stores one log per workout, starting with what was logged before it', async () => {
    const recorder = new LogRecorder(memoryStore())
    recorder.write(entry('paired'))
    recorder.start('The Gorby')
    recorder.write(entry('target 200 W'))

    const [session] = await recorder.list()
    expect(session?.label).toBe('The Gorby')
    const text = await recorder.read(session!.id)
    expect(text).toMatch(/paired\n.*target 200 W\n$/)
  })

  it('keeps the last sessions only, and deletes the older ones', async () => {
    const store = memoryStore()
    const recorder = new LogRecorder(store)
    for (let i = 0; i <= MAX_LOG_SESSIONS; i++) {
      recorder.start(`workout ${i}`)
      recorder.write(entry(`line ${i}`))
    }
    const sessions = await recorder.list()
    expect(sessions).toHaveLength(MAX_LOG_SESSIONS)
    expect(sessions[0]?.label).toBe(`workout ${MAX_LOG_SESSIONS}`)
    expect(sessions.at(-1)?.label).toBe('workout 1')
    const chunks = [...store.map.keys()].filter((k) => k !== 'sessions')
    expect(chunks).toHaveLength(MAX_LOG_SESSIONS)
  })

  it('starts a log on an error outside a workout', async () => {
    const recorder = new LogRecorder(memoryStore())
    recorder.write(entry('connecting'))
    recorder.write(entry('refused control', 'error'))
    const [session] = await recorder.list()
    expect(session?.label).toBe('Error outside a workout')
    expect(await recorder.read(session!.id)).toMatch(/connecting\n.*refused control\n$/)
  })

  it('reads logs stored by a previous page', async () => {
    const store = memoryStore()
    const first = new LogRecorder(store)
    first.start('The Gorby')
    first.write(entry('hello'))
    await first.flush()

    const [session] = await new LogRecorder(store).list()
    expect(await new LogRecorder(store).read(session!.id)).toMatch(/hello\n$/)
  })
})

describe('logFileName', () => {
  it('names the file after the start time', () => {
    expect(logFileName(new Date(2026, 8, 28, 7, 5, 3))).toBe('tiny_trainer_2026-09-28_07-05-03.log')
  })
})
