import { useState, type DragEvent } from 'react'
import type { SavedWorkout } from '../../storage/workouts'
import { formatDuration, parseZwo, totalDuration } from '../../workout'

interface Props {
  workouts: SavedWorkout[]
  /** Contents of `.zwo` files, already validated. */
  onImport: (files: string[]) => Promise<void>
  onCreate: () => void
  onOpen: (id: string) => void
  onDelete: (id: string) => void
}

interface ImportMessage {
  kind: 'error' | 'warn' | 'ok'
  text: string
}

export function Library({ workouts, onImport, onCreate, onOpen, onDelete }: Props) {
  const [dragging, setDragging] = useState(false)
  const [messages, setMessages] = useState<ImportMessage[]>([])

  const importFiles = async (files: File[]) => {
    const valid: string[] = []
    const out: ImportMessage[] = []
    for (const file of files) {
      try {
        const warnings: string[] = []
        const xml = await file.text()
        parseZwo(xml, { onWarning: (w) => warnings.push(w) })
        valid.push(xml)
        out.push({ kind: 'ok', text: `Imported ${file.name}.` })
        for (const w of warnings) out.push({ kind: 'warn', text: `${file.name}: ${w}` })
      } catch (error) {
        out.push({
          kind: 'error',
          text: `${file.name}: ${error instanceof Error ? error.message : error}`,
        })
      }
    }
    setMessages(out)
    if (valid.length > 0) await onImport(valid)
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setDragging(false)
    void importFiles(Array.from(e.dataTransfer.files))
  }

  return (
    <section
      className={`screen library ${dragging ? 'dragging' : ''}`}
      onDragOver={(e) => {
        e.preventDefault()
        setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
    >
      <h1>Workouts</h1>

      <div className="add-row">
        <label className="dropzone">
          <input
            type="file"
            accept=".zwo,application/xml,text/xml"
            multiple
            onChange={(e) => {
              void importFiles(Array.from(e.target.files ?? []))
              e.target.value = ''
            }}
          />
          <strong>Import .zwo files</strong>
          <span>Click to choose, or drop files here</span>
        </label>
        <button className="dropzone create" onClick={onCreate}>
          <strong>Create a workout</strong>
          <span>Build one from blocks in the editor</span>
        </button>
      </div>

      {messages.length > 0 && (
        <ul className="messages">
          {messages.map((m, i) => (
            <li key={i} className={`message message-${m.kind}`}>
              {m.text}
            </li>
          ))}
        </ul>
      )}

      {workouts.length === 0 && (
        <p className="muted">No workouts yet. Default workouts can be shown again in settings.</p>
      )}
      <ul className="workout-list">
        {workouts.map(({ id, workout, isDefault }) => (
          <li key={id} className="workout-item">
            <button className="workout-open" onClick={() => onOpen(id)}>
              <span className="workout-name">{workout.name}</span>
              <span className="workout-meta">
                {formatDuration(totalDuration(workout))} · {workout.segments.length} steps
                {workout.author ? ` · ${workout.author}` : ''}
              </span>
            </button>
            {isDefault && <span className="badge">default</span>}
            {!isDefault && (
              <button
                className="btn btn-ghost"
                aria-label={`Delete ${workout.name}`}
                onClick={() => {
                  if (confirm(`Delete "${workout.name}"?`)) onDelete(id)
                }}
              >
                🗑
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
