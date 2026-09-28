import { useEffect, useRef, useState, type FormEvent } from 'react'
import { logRecorder, type LogSession } from '../../storage/logs'
import { BleDebugPanel } from '../components/BleDebugPanel'
import { downloadText } from '../download'

type LogLevel = 'info' | 'debug'

interface Props {
  ftp?: number
  logLevel: LogLevel
  onLogLevelChange: (level: LogLevel) => void
  onSave: (ftp: number) => void
  onBack: () => void
}

export function Settings({ ftp, logLevel, onLogLevelChange, onSave, onBack }: Props) {
  const [value, setValue] = useState(ftp?.toString() ?? '')
  const parsed = Number(value)
  const valid = Number.isInteger(parsed) && parsed >= 50 && parsed <= 600
  const [debug, toggleDebug] = useDebugShortcut()

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (valid) onSave(parsed)
  }

  return (
    <section className="screen">
      <button className="btn btn-ghost back" onClick={onBack}>
        ← Back
      </button>
      <h1 onClick={toggleDebug}>Settings</h1>
      <form className="settings-form" onSubmit={submit}>
        <label htmlFor="ftp">FTP (watts)</label>
        <input
          id="ftp"
          type="number"
          inputMode="numeric"
          min={50}
          max={600}
          required
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        <p className="hint">Workout power targets are percentages of your FTP.</p>
        <button className="btn btn-primary btn-large" type="submit" disabled={!valid}>
          Save
        </button>
      </form>
      <LogPanel level={logLevel} onLevelChange={onLogLevelChange} />
      {debug && <BleDebugPanel />}
    </section>
  )
}

const DEBUG_WORD = 'ble'
const DEBUG_TAPS = 5
const TAP_WINDOW_MS = 2000

/**
 * The Bluetooth debug panel is hidden: typing `ble` (outside a field) toggles it, and so does
 * tapping the title 5 times, for tablets. Returns the title click handler.
 */
function useDebugShortcut(): [boolean, () => void] {
  const [open, setOpen] = useState(false)
  const taps = useRef<number[]>([])

  useEffect(() => {
    let typed = ''
    const onKey = (e: KeyboardEvent) => {
      const inField =
        e.target instanceof Element && e.target.closest('input, select, textarea') !== null
      if (inField || e.metaKey || e.ctrlKey || e.altKey) return
      typed = (typed + e.key.toLowerCase()).slice(-DEBUG_WORD.length)
      if (typed === DEBUG_WORD) setOpen((o) => !o)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const onTitleClick = () => {
    const now = Date.now()
    taps.current = [...taps.current.filter((t) => now - t < TAP_WINDOW_MS), now]
    if (taps.current.length >= DEBUG_TAPS) {
      taps.current = []
      setOpen((o) => !o)
    }
  }

  return [open, onTitleClick]
}

function LogPanel({
  level,
  onLevelChange,
}: {
  level: LogLevel
  onLevelChange: (level: LogLevel) => void
}) {
  const [sessions, setSessions] = useState<LogSession[]>()

  useEffect(() => {
    void logRecorder.list().then(setSessions)
  }, [])

  const download = async (session: LogSession) => {
    downloadText(session.file, await logRecorder.read(session.id))
  }

  return (
    <div className="log-panel">
      <h2>Logs</h2>
      <label htmlFor="log-level">Log level</label>
      <select
        id="log-level"
        className="field-select"
        value={level}
        onChange={(e) => onLevelChange(e.target.value as LogLevel)}
      >
        <option value="info">Normal</option>
        <option value="debug">Debug</option>
      </select>
      <p className="hint">
        Normal logs the commands sent to the trainer and its responses. Debug also logs every power,
        cadence and speed reading. Errors always come with the 50 entries before and after them.
      </p>
      {sessions?.length === 0 && <p className="muted">No logs yet. One is kept per workout.</p>}
      {sessions && sessions.length > 0 && (
        <ul className="workout-list">
          {sessions.map((session) => (
            <li key={session.id} className="workout-item log-item">
              <div className="log-info">
                <span className="workout-name">{session.label}</span>
                <span className="workout-meta">
                  {new Date(session.startedAt).toLocaleString()} · {formatSize(session.size)}
                </span>
              </div>
              <button className="btn btn-secondary" onClick={() => void download(session)}>
                Download
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
