import { useState, type FormEvent } from 'react'

interface Props {
  ftp?: number
  onSave: (ftp: number) => void
  onBack: () => void
}

export function Settings({ ftp, onSave, onBack }: Props) {
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
    </section>
  )
}
