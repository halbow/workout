import { formatEntry, Logger, type LogSink } from './logger'

export {
  CONTEXT_SIZE,
  formatEntry,
  Logger,
  toHex,
  type LogEntry,
  type LogLevel,
  type LogSink,
} from './logger'

/** The app-wide logger. Has no sink until `main.tsx` adds them, so tests stay quiet. */
export const log = new Logger()

export function consoleSink(): LogSink {
  return (entry) => {
    const method = entry.level === 'error' ? 'error' : entry.level === 'warn' ? 'warn' : 'debug'
    console[method](formatEntry(entry))
  }
}
