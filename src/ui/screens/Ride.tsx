import { useEffect, useState } from 'react'
import { log } from '../../logging'
import { WorkoutRunner } from '../../runner'
import { logRecorder } from '../../storage/logs'
import { formatDuration, type Workout } from '../../workout'
import { BigMetric } from '../components/BigMetric'
import { PowerProfileChart } from '../components/PowerProfileChart'
import { useRunner } from '../hooks/useRunner'
import { useTrainer } from '../hooks/useTrainer'
import { useWakeLock } from '../hooks/useWakeLock'
import { describePower } from '../zones'

interface Props {
  workout: Workout
  ftp: number
  onExit: () => void
}

export function Ride({ workout, ftp, onExit }: Props) {
  const { session } = useTrainer()
  const [runner] = useState(() => new WorkoutRunner({ workout, trainer: session.trainer, ftp }))
  useEffect(() => runner.attach(), [runner])
  return <RideView runner={runner} workout={workout} ftp={ftp} onExit={onExit} />
}

function RideView({ runner, workout, ftp, onExit }: Props & { runner: WorkoutRunner }) {
  const s = useRunner(runner)
  const { session, status, ready } = useTrainer()
  const active = s.state === 'running' || s.state === 'paused'
  useWakeLock(s.state === 'running')

  // Warn before closing the tab mid-ride.
  useEffect(() => {
    if (!active) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [active])

  const power = s.live.power
  const tone =
    power === undefined || s.targetPower === undefined
      ? 'default'
      : Math.abs(power - s.targetPower) <= Math.max(10, s.targetPower * 0.05)
        ? 'good'
        : 'warn'

  const start = () => {
    // One log per workout, named after its start time.
    logRecorder.start(workout.name)
    log.log('info', 'ride', `workout "${workout.name}" started`, {
      ftp,
      trainer: session.trainer.name,
    })
    runner.start()
  }

  const exit = () => {
    if (active && !confirm('Stop the workout?')) return
    runner.stop()
    onExit()
  }

  return (
    <section className="screen ride">
      <div className="ride-top">
        <h1 className="ride-title">{workout.name}</h1>
        <button className="btn btn-ghost" onClick={exit}>
          {active ? 'Stop & exit' : 'Exit'}
        </button>
      </div>

      {s.state === 'paused' && s.pauseReason === 'trainer-disconnected' && (
        <div className="banner banner-error">
          <span>The trainer disconnected. The workout is paused.</span>
          {status === 'connecting' ? (
            <button className="btn" disabled>
              Reconnecting…
            </button>
          ) : ready ? null : (
            <button className="btn btn-primary" onClick={() => void session.reconnect()}>
              Reconnect
            </button>
          )}
        </div>
      )}

      {s.activeTextEvent && <div className="text-event">{s.activeTextEvent.message}</div>}

      <div className="metrics-main">
        <BigMetric
          label="Target"
          value={s.segment?.kind === 'free' ? 'FREE' : s.targetPower}
          unit={s.segment?.kind === 'free' ? undefined : 'W'}
          size="xl"
        />
        <BigMetric label="Power" value={power} unit="W" size="xl" tone={tone} />
      </div>
      <div className="metrics-grid">
        <BigMetric
          label="Cadence"
          value={s.live.cadence !== undefined ? Math.round(s.live.cadence) : undefined}
          unit="rpm"
        />
        <BigMetric label="Step left" value={formatDuration(s.segmentRemaining)} />
        <BigMetric label="Total left" value={formatDuration(s.remaining)} />
        <BigMetric label="Elapsed" value={formatDuration(s.elapsed)} size="md" />
        {s.live.heartRate !== undefined && (
          <BigMetric label="Heart rate" value={s.live.heartRate} unit="bpm" size="md" />
        )}
      </div>

      <div className="step-now">
        <span className="muted">Now</span> {s.segment?.label ?? '—'}
        {s.segment && <span className="muted"> · {describePower(s.segment, ftp)}</span>}
      </div>
      <div className="step-next">
        <span className="muted">Next</span>{' '}
        {s.nextSegment
          ? `${s.nextSegment.label ?? s.nextSegment.kind} · ${describePower(s.nextSegment, ftp)} · ${formatDuration(s.nextSegment.duration)}`
          : 'Finish'}
      </div>

      <PowerProfileChart
        workout={workout}
        elapsed={s.elapsed}
        currentIndex={s.segmentIndex}
        height={100}
      />

      <div className="controls">
        {s.state === 'idle' && (
          <button className="btn btn-primary btn-large" disabled={!ready} onClick={start}>
            Start
          </button>
        )}
        {s.state === 'running' && (
          <button className="btn btn-secondary btn-large" onClick={() => runner.pause()}>
            Pause
          </button>
        )}
        {s.state === 'paused' && (
          <button
            className="btn btn-primary btn-large"
            disabled={!ready}
            onClick={() => runner.resume()}
          >
            Resume
          </button>
        )}
        {active && (
          <button
            className="btn btn-danger btn-large"
            onClick={() => {
              if (confirm('Stop the workout?')) runner.stop()
            }}
          >
            Stop
          </button>
        )}
        {(s.state === 'finished' || s.state === 'stopped') && (
          <div className="done">
            <p>{s.state === 'finished' ? 'Workout complete. Nice work!' : 'Workout stopped.'}</p>
            <button className="btn btn-primary btn-large" onClick={onExit}>
              Back to workouts
            </button>
          </div>
        )}
      </div>
    </section>
  )
}
