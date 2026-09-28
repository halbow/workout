export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export interface LogEntry {
  /** `Date.now()` when the entry was logged. */
  time: number
  level: LogLevel
  scope: string
  message: string
  data?: unknown
  /** Set on entries written only because they surround an error. */
  context?: boolean
}

export type LogSink = (entry: LogEntry) => void

/** Entries kept before an error, and entries written after it, whatever the level. */
export const CONTEXT_SIZE = 50

const RANK: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 }

/**
 * Levels:
 * - `info`: commands sent to the trainer and their responses, status changes, errors.
 * - `debug`: also every data notification (power, cadence… several per second).
 *
 * Every entry is kept in a ring buffer whatever the level. On an error, the last
 * `CONTEXT_SIZE` entries and the next `CONTEXT_SIZE` ones are written too.
 */
export class Logger {
  level: 'debug' | 'info' = 'info'

  private readonly sinks = new Set<LogSink>()
  private readonly observers = new Set<LogSink>()
  private history: LogEntry[] = []
  private contextRemaining = 0

  constructor(private readonly now: () => number = Date.now) {}

  addSink(sink: LogSink): () => void {
    this.sinks.add(sink)
    return () => this.sinks.delete(sink)
  }

  /** Unlike a sink, an observer gets every entry, whatever the level. For live views. */
  observe(observer: LogSink): () => void {
    this.observers.add(observer)
    return () => this.observers.delete(observer)
  }

  scope(scope: string) {
    return {
      debug: (message: string, data?: unknown) => this.log('debug', scope, message, data),
      info: (message: string, data?: unknown) => this.log('info', scope, message, data),
      warn: (message: string, data?: unknown) => this.log('warn', scope, message, data),
      error: (message: string, data?: unknown) => this.log('error', scope, message, data),
    }
  }

  log(level: LogLevel, scope: string, message: string, data?: unknown) {
    const entry: LogEntry = { time: this.now(), level, scope, message }
    if (data !== undefined) entry.data = data

    if (level === 'error') {
      // Inside a context window everything before was already written.
      if (this.contextRemaining === 0 && this.history.length > 0) {
        this.marker(`${this.history.length} entries before the error`)
        for (const previous of this.history) this.write({ ...previous, context: true })
      }
      this.write(entry)
      this.contextRemaining = CONTEXT_SIZE
    } else if (this.contextRemaining > 0) {
      this.write(RANK[level] < RANK[this.level] ? { ...entry, context: true } : entry)
      this.contextRemaining--
      if (this.contextRemaining === 0) this.marker('end of error context')
    } else if (RANK[level] >= RANK[this.level]) {
      this.write(entry)
    }

    this.history.push(entry)
    if (this.history.length > CONTEXT_SIZE) this.history.shift()
    notify(this.observers, entry)
  }

  private marker(message: string) {
    this.write({ time: this.now(), level: 'info', scope: 'log', message: `--- ${message} ---` })
  }

  private write(entry: LogEntry) {
    notify(this.sinks, entry)
  }
}

function notify(sinks: Set<LogSink>, entry: LogEntry) {
  for (const sink of sinks) {
    try {
      sink(entry)
    } catch {
      // A broken sink must not break the app.
    }
  }
}

export function formatEntry(entry: LogEntry): string {
  const level = entry.level.toUpperCase().padEnd(5)
  const context = entry.context ? ' (context)' : ''
  const data = entry.data === undefined ? '' : ` ${stringify(entry.data)}`
  return `${new Date(entry.time).toISOString()} ${level} [${entry.scope}]${context} ${entry.message}${data}`
}

function stringify(data: unknown): string {
  if (data instanceof Error) return JSON.stringify({ name: data.name, message: data.message })
  try {
    return JSON.stringify(data) ?? String(data)
  } catch {
    return String(data)
  }
}

/** `05 c8 00` */
export function toHex(bytes: DataView | Uint8Array): string {
  const array =
    bytes instanceof DataView
      ? new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength)
      : bytes
  return Array.from(array, (b) => b.toString(16).padStart(2, '0')).join(' ')
}
