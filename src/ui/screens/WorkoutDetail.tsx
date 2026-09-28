import { formatDuration, totalDuration, type Workout } from '../../workout'
import { PowerProfileChart } from '../components/PowerProfileChart'
import { downloadText } from '../download'
import { useTrainer } from '../hooks/useTrainer'
import { describePower, segmentColor } from '../zones'

interface Props {
  workout: Workout
  /** The stored `.zwo` file, offered as a download. */
  zwo: string
  ftp?: number
  onStart: () => void
  onEdit: () => void
  onBack: () => void
  onSettings: () => void
}

export function WorkoutDetail({ workout, zwo, ftp, onStart, onEdit, onBack, onSettings }: Props) {
  const { ready } = useTrainer()
  const canStart = ready && ftp !== undefined

  return (
    <section className="screen">
      <button className="btn btn-ghost back" onClick={onBack}>
        ← Workouts
      </button>
      <div className="title-row">
        <h1>{workout.name}</h1>
        <div className="title-actions">
          <button className="btn btn-secondary" onClick={() => downloadZwo(workout.name, zwo)}>
            Download .zwo
          </button>
          <button className="btn btn-secondary" onClick={onEdit}>
            Edit
          </button>
        </div>
      </div>
      <p className="muted">
        {formatDuration(totalDuration(workout))}
        {workout.author ? ` · ${workout.author}` : ''}
      </p>
      {workout.description && <p className="description">{workout.description}</p>}

      <PowerProfileChart workout={workout} />

      <div className="start-row">
        <button className="btn btn-primary btn-large" disabled={!canStart} onClick={onStart}>
          Start workout
        </button>
        {ftp === undefined ? (
          <p className="hint">
            Set your FTP in{' '}
            <button className="link" onClick={onSettings}>
              settings
            </button>{' '}
            first.
          </p>
        ) : (
          !ready && <p className="hint">Pair a trainer to start.</p>
        )}
      </div>

      <ol className="steps">
        {workout.segments.map((segment, i) => (
          <li key={i} className="step">
            <span className="step-swatch" style={{ background: segmentColor(segment) }} />
            <span className="step-label">{segment.label ?? segment.kind}</span>
            <span className="step-power">{describePower(segment, ftp)}</span>
            <span className="step-duration">{formatDuration(segment.duration)}</span>
          </li>
        ))}
      </ol>
    </section>
  )
}

function downloadZwo(name: string, zwo: string) {
  downloadText(`${fileName(name)}.zwo`, zwo, 'application/xml')
}

/** Keeps the name readable but drops characters file systems reject. */
function fileName(name: string): string {
  return name.replace(/[\\/:*?"<>|]+/g, '').trim() || 'workout'
}
