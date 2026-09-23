import { totalDuration, type Workout } from '../../workout'
import { segmentColor } from '../zones'

interface Props {
  workout: Workout
  /** Seconds. When set, the completed part is dimmed and a cursor is drawn. */
  elapsed?: number
  currentIndex?: number
  height?: number
}

const FREE_HEIGHT = 0.5

/** SVG power profile: x is time, y is fraction of FTP, bars coloured by zone. */
export function PowerProfileChart({ workout, elapsed, currentIndex, height = 140 }: Props) {
  const total = totalDuration(workout)
  const peak = Math.max(
    1.2,
    ...workout.segments.map((s) =>
      s.kind === 'steady' ? s.power : s.kind === 'ramp' ? Math.max(s.powerStart, s.powerEnd) : 0,
    ),
  )
  const yMax = peak * 1.1
  const width = 1000
  const x = (t: number) => (t / total) * width
  const y = (p: number) => height - (p / yMax) * height

  const starts: number[] = []
  let offset = 0
  for (const segment of workout.segments) {
    starts.push(offset)
    offset += segment.duration
  }
  const shapes = workout.segments.map((segment, i) => {
    const x0 = x(starts[i]!)
    const x1 = x(starts[i]! + segment.duration)
    const [p0, p1] =
      segment.kind === 'steady'
        ? [segment.power, segment.power]
        : segment.kind === 'ramp'
          ? [segment.powerStart, segment.powerEnd]
          : [FREE_HEIGHT, FREE_HEIGHT]
    const points = `${x0},${height} ${x0},${y(p0)} ${x1},${y(p1)} ${x1},${height}`
    return (
      <polygon
        key={i}
        points={points}
        fill={segmentColor(segment)}
        opacity={currentIndex === undefined || currentIndex === i ? 1 : 0.75}
        stroke="var(--bg)"
        strokeWidth={1}
        vectorEffect="non-scaling-stroke"
      />
    )
  })

  return (
    <svg
      className="profile-chart"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={`Power profile of ${workout.name}`}
      style={{ height }}
    >
      <line
        x1={0}
        x2={width}
        y1={y(1)}
        y2={y(1)}
        className="ftp-line"
        vectorEffect="non-scaling-stroke"
      />
      {shapes}
      {elapsed !== undefined && (
        <>
          <rect x={0} y={0} width={x(elapsed)} height={height} className="profile-done" />
          <line
            x1={x(elapsed)}
            x2={x(elapsed)}
            y1={0}
            y2={height}
            className="profile-cursor"
            vectorEffect="non-scaling-stroke"
          />
        </>
      )}
    </svg>
  )
}
