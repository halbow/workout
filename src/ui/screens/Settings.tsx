import { useEffect, useState, type FormEvent } from 'react'
import { logRecorder, type LogSession } from '../../storage/logs'
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

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (valid) onSave(parsed)
  }

  return (
    <section className="screen">
      <button className="btn btn-ghost back" onClick={onBack}>
        ← Back
      </button>
      <h1>Settings</h1>
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
    </section>
  )
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
