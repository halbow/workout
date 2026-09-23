import { useState, type DragEvent } from 'react'
import type { SavedWorkout } from '../../storage/workouts'
import { formatDuration, parseZwo, totalDuration, type Workout } from '../../workout'
import sampleXml from '../sample-workout.zwo?raw'

interface Props {
  workouts: SavedWorkout[]
  onImport: (workouts: Workout[]) => Promise<void>
  onOpen: (id: string) => void
  onDelete: (id: string) => void
}

interface ImportMessage {
  kind: 'error' | 'warn' | 'ok'
  text: string
}

export function Library({ workouts, onImport, onOpen, onDelete }: Props) {
  const [dragging, setDragging] = useState(false)
  const [messages, setMessages] = useState<ImportMessage[]>([])

  const importFiles = async (files: File[]) => {
    const parsed: Workout[] = []
    const out: ImportMessage[] = []
    for (const file of files) {
      try {
        const warnings: string[] = []
        parsed.push(parseZwo(await file.text(), { onWarning: (w) => warnings.push(w) }))
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
    if (parsed.length > 0) await onImport(parsed)
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

      {messages.length > 0 && (
        <ul className="messages">
          {messages.map((m, i) => (
            <li key={i} className={`message message-${m.kind}`}>
              {m.text}
            </li>
          ))}
        </ul>
      )}

      {workouts.length === 0 ? (
        <div className="empty">
          <p>No workouts yet.</p>
          <button
            className="btn btn-secondary"
            onClick={() => void onImport([parseZwo(sampleXml)])}
          >
            Add a sample workout
          </button>
        </div>
      ) : (
        <ul className="workout-list">
          {workouts.map(({ id, workout }) => (
            <li key={id} className="workout-item">
              <button className="workout-open" onClick={() => onOpen(id)}>
                <span className="workout-name">{workout.name}</span>
                <span className="workout-meta">
                  {formatDuration(totalDuration(workout))} · {workout.segments.length} steps
                  {workout.author ? ` · ${workout.author}` : ''}
                </span>
              </button>
              <button
                className="btn btn-ghost"
                aria-label={`Delete ${workout.name}`}
                onClick={() => {
                  if (confirm(`Delete "${workout.name}"?`)) onDelete(id)
                }}
              >
                🗑
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
