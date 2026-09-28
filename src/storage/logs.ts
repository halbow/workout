import { createStore, del, get, set } from 'idb-keyval'
import { formatEntry, type LogEntry, type LogSink } from '../logging'

/** One log file: a workout, or what happened around an error outside a workout. */
export interface LogSession {
  id: string
  /** `tiny_trainer_2026-09-28_10-15-00.log` */
  file: string
  /** Workout name, or why the log was started. */
  label: string
  startedAt: number
  /** The text is stored in chunks (`<id>:0`, `<id>:1`…) so a flush never rewrites the whole log. */
  chunks: number
  /** Bytes, roughly (UTF-16 code units). */
  size: number
}

/** The subset of idb-keyval used here, so tests can use a Map. */
export interface KeyValueStore {
  get<T>(key: string): Promise<T | undefined>
  set(key: string, value: unknown): Promise<void>
  del(key: string): Promise<void>
}

export const MAX_LOG_SESSIONS = 10
/** Lines kept while no log is open, to seed the next one (e.g. pairing before a workout). */
const PREAMBLE_LINES = 200
const FLUSH_MS = 2000
const INDEX_KEY = 'sessions'

/** `tiny_trainer_2026-09-28_10-15-00.log`, in local time. */
export function logFileName(startedAt: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  const date = `${startedAt.getFullYear()}-${pad(startedAt.getMonth() + 1)}-${pad(startedAt.getDate())}`
  const time = `${pad(startedAt.getHours())}-${pad(startedAt.getMinutes())}-${pad(startedAt.getSeconds())}`
  return `tiny_trainer_${date}_${time}.log`
}

/**
 * Keeps the last `MAX_LOG_SESSIONS` logs in IndexedDB. A log starts when a workout starts, or on
 * an error outside a workout, and goes on until the next one starts. Until then, lines are kept
 * in memory and written at the top of the next log.
 */
export class LogRecorder {
  private current?: LogSession
  private preamble: string[] = []
  private buffer: string[] = []
  private timer?: ReturnType<typeof setTimeout>
  /** IndexedDB writes run one after the other. */
  private tail: Promise<unknown> = Promise.resolve()
  private index?: Promise<LogSession[]>

  constructor(
    private readonly store: KeyValueStore = idbStore(),
    private readonly now: () => number = Date.now,
  ) {}

  /** Starts a new log, e.g. `start('The Gorby')` when a workout starts. */
  start(label: string) {
    this.flush()
    const startedAt = this.now()
    const session: LogSession = {
      id: crypto.randomUUID(),
      file: logFileName(new Date(startedAt)),
      label,
      startedAt,
      chunks: 0,
      size: 0,
    }
    this.current = session
    this.buffer = this.preamble
    this.preamble = []
    void this.enqueue(async () => {
      const sessions = [session, ...(await this.loadIndex())]
      for (const old of sessions.splice(MAX_LOG_SESSIONS)) await this.deleteSession(old)
      await this.saveIndex(sessions)
    })
    if (this.buffer.length > 0) this.scheduleFlush()
  }

  write: LogSink = (entry: LogEntry) => {
    if (!this.current && entry.level === 'error') this.start('Error outside a workout')
    const line = formatEntry(entry)
    if (!this.current) {
      this.preamble.push(line)
      if (this.preamble.length > PREAMBLE_LINES) this.preamble.shift()
      return
    }
    this.buffer.push(line)
    if (entry.level === 'error') this.flush()
    else this.scheduleFlush()
  }

  /** Writes buffered lines. Resolves once they are stored. */
  flush = (): Promise<void> => {
    clearTimeout(this.timer)
    this.timer = undefined
    const session = this.current
    if (!session || this.buffer.length === 0) return this.enqueue(async () => {})
    const text = this.buffer.join('\n') + '\n'
    this.buffer = []
    return this.enqueue(async () => {
      await this.store.set(`${session.id}:${session.chunks}`, text)
      session.chunks++
      session.size += text.length
      const sessions = await this.loadIndex()
      if (sessions.some((s) => s.id === session.id)) await this.saveIndex(sessions)
    })
  }

  /** Newest first. */
  async list(): Promise<LogSession[]> {
    await this.flush()
    return (await this.loadIndex()).map((s) => ({ ...s }))
  }

  async read(id: string): Promise<string> {
    await this.flush()
    const session = (await this.loadIndex()).find((s) => s.id === id)
    if (!session) throw new Error(`No log with id ${id}.`)
    const chunks = await Promise.all(
      Array.from({ length: session.chunks }, (_, i) => this.store.get<string>(`${id}:${i}`)),
    )
    return chunks.join('')
  }

  private scheduleFlush() {
    this.timer ??= setTimeout(() => void this.flush(), FLUSH_MS)
  }

  private enqueue(task: () => Promise<void>): Promise<void> {
    // A failed write (quota, private mode) must not break logging or the app.
    const result = this.tail.then(task).catch(() => {})
    this.tail = result
    return result
  }

  private loadIndex(): Promise<LogSession[]> {
    this.index ??= this.store.get<LogSession[]>(INDEX_KEY).then((s) => s ?? [])
    return this.index
  }

  private async saveIndex(sessions: LogSession[]) {
    this.index = Promise.resolve(sessions)
    await this.store.set(INDEX_KEY, sessions)
  }

  private async deleteSession(session: LogSession) {
    for (let i = 0; i < session.chunks; i++) await this.store.del(`${session.id}:${i}`)
  }
}

function idbStore(): KeyValueStore {
  const store = createStore('erg-player-logs', 'logs')
  return {
    get: (key) => get(key, store),
    set: (key, value) => set(key, value, store),
    del: (key) => del(key, store),
  }
}

/** The app-wide recorder, added as a log sink in `main.tsx`. */
export const logRecorder = new LogRecorder()
