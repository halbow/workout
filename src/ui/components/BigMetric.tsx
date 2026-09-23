interface Props {
  label: string
  value: string | number | undefined
  unit?: string
  size?: 'xl' | 'lg' | 'md'
  tone?: 'default' | 'good' | 'warn' | 'bad'
}

export function BigMetric({ label, value, unit, size = 'lg', tone = 'default' }: Props) {
  return (
    <div className={`metric metric-${size} tone-${tone}`}>
      <div className="metric-label">{label}</div>
      <div className="metric-value">
        {value ?? '--'}
        {unit && value !== undefined && <span className="metric-unit">{unit}</span>}
      </div>
    </div>
  )
}
