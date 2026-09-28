import { describe, expect, it } from 'vitest'
import { CONTEXT_SIZE, formatEntry, Logger, toHex, type LogEntry } from '../logger'

function setup(level: 'debug' | 'info' = 'info') {
  const logger = new Logger(() => 0)
  logger.level = level
  const written: LogEntry[] = []
  logger.addSink((e) => written.push(e))
  return { log: logger.scope('test'), written, messages: () => written.map((e) => e.message) }
}

describe('Logger', () => {
  it('skips debug entries in info mode', () => {
    const { log, messages } = setup('info')
    log.debug('bike data')
    log.info('command sent')
    expect(messages()).toEqual(['command sent'])
  })

  it('writes debug entries in debug mode', () => {
    const { log, messages } = setup('debug')
    log.debug('bike data')
    expect(messages()).toEqual(['bike data'])
  })

  it('writes the entries before and after an error', () => {
    const { log, written, messages } = setup('info')
    for (let i = 0; i < CONTEXT_SIZE + 10; i++) log.debug(`before ${i}`)
    log.error('boom')
    for (let i = 0; i < CONTEXT_SIZE + 10; i++) log.debug(`after ${i}`)

    const all = messages()
    const error = all.indexOf('boom')
    const before = all.slice(0, error).filter((m) => m.startsWith('before'))
    expect(before).toHaveLength(CONTEXT_SIZE)
    expect(before[0]).toBe('before 10')
    const after = all.slice(error).filter((m) => m.startsWith('after'))
    expect(after).toHaveLength(CONTEXT_SIZE)
    expect(after.at(-1)).toBe(`after ${CONTEXT_SIZE - 1}`)
    expect(all.at(-1)).toMatch(/end of error context/)
    expect(written.find((e) => e.message === 'before 10')?.context).toBe(true)
  })

  it('does not repeat the history for an error inside an error context', () => {
    const { log, messages } = setup('info')
    log.debug('a')
    log.error('first')
    log.debug('b')
    log.error('second')
    expect(messages().filter((m) => m === 'a' || m === 'b')).toEqual(['a', 'b'])
  })

  it('gives observers every entry, whatever the level', () => {
    const logger = new Logger(() => 0)
    const seen: string[] = []
    const stop = logger.observe((e) => seen.push(e.message))
    logger.log('debug', 'test', 'bike data')
    logger.log('info', 'test', 'command sent')
    stop()
    logger.log('info', 'test', 'after stop')
    expect(seen).toEqual(['bike data', 'command sent'])
  })

  it('keeps working when a sink throws', () => {
    const logger = new Logger()
    logger.addSink(() => {
      throw new Error('broken')
    })
    expect(() => logger.log('error', 'test', 'boom')).not.toThrow()
  })
})

describe('formatEntry', () => {
  it('formats a line with time, level, scope and data', () => {
    const line = formatEntry({
      time: 0,
      level: 'info',
      scope: 'ftms',
      message: 'sent',
      data: { w: 200 },
    })
    expect(line).toBe('1970-01-01T00:00:00.000Z INFO  [ftms] sent {"w":200}')
  })
})

describe('toHex', () => {
  it('formats bytes', () => {
    expect(toHex(new Uint8Array([0x05, 0xc8, 0x00]))).toBe('05 c8 00')
    expect(toHex(new DataView(new Uint8Array([1, 2, 255]).buffer, 1))).toBe('02 ff')
  })
})
