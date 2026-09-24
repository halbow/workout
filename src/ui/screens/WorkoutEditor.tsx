import { useState, type DragEvent } from 'react'
import {
  blockDuration,
  blockErrors,
  blocksDuration,
  defaultBlock,
  documentToWorkout,
  formatDuration,
  LIMITS,
  maxDuration,
  moveItem,
  type Block,
  type BlockKind,
  type ZwoDocument,
} from '../../workout'
import { PowerProfileChart } from '../components/PowerProfileChart'

interface Props {
  /** The workout to edit. Without it, the editor starts empty. */
  initial?: ZwoDocument
  onSave: (doc: ZwoDocument) => Promise<void>
  onBack: () => void
}

interface Item {
  id: string
  block: Block
}

const PALETTE: { kind: BlockKind; label: string }[] = [
  { kind: 'warmup', label: 'Warmup' },
  { kind: 'steady', label: 'Steady' },
  { kind: 'interval', label: 'Intervals' },
  { kind: 'cooldown', label: 'Cooldown' },
]

const LABELS: Record<BlockKind, string> = {
  warmup: 'Warmup',
  steady: 'Steady',
  interval: 'Intervals',
  cooldown: 'Cooldown',
  ramp: 'Ramp',
  freeride: 'Free ride',
  maxeffort: 'Max effort',
}

// Palette drags carry a block kind, list drags carry the index of the block being moved.
const KIND_MIME = 'application/x-block-kind'
const INDEX_MIME = 'application/x-block-index'

export function WorkoutEditor({ initial, onSave, onBack }: Props) {
  const [name, setName] = useState(initial?.name ?? '')
  const [items, setItems] = useState<Item[]>(() =>
    (initial?.blocks ?? []).map((block) => ({ id: crypto.randomUUID(), block })),
  )
  const [dropIndex, setDropIndex] = useState<number>()
  const [saving, setSaving] = useState(false)

  const blocks = items.map((i) => i.block)
  const full = items.length >= LIMITS.blocks
  const tooMany = items.length > LIMITS.blocks
  const valid = items.length > 0 && !tooMany && blocks.every((b) => blockErrors(b).length === 0)
  const textEvents = initial?.textEvents ?? []
  const doc: ZwoDocument = {
    name: name.trim() || 'Untitled workout',
    author: initial?.author,
    description: initial?.description,
    blocks,
    textEvents,
  }
  const preview = documentToWorkout(doc)

  const insert = (kind: BlockKind, at = items.length) =>
    setItems((prev) => {
      if (prev.length >= LIMITS.blocks) return prev
      const next = [...prev]
      next.splice(at, 0, { id: crypto.randomUUID(), block: defaultBlock(kind) })
      return next
    })
  const update = (id: string, block: Block) =>
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, block } : i)))
  const remove = (id: string) => setItems((prev) => prev.filter((i) => i.id !== id))
  const move = (from: number, to: number) => setItems((prev) => moveItem(prev, from, to))

  const onDragOver = (e: DragEvent, index: number) => {
    const types = e.dataTransfer.types
    if (!(types.includes(KIND_MIME) && !full) && !types.includes(INDEX_MIME)) return
    e.preventDefault()
    e.stopPropagation()
    setDropIndex(index)
  }

  const onDrop = (e: DragEvent, index: number) => {
    e.preventDefault()
    e.stopPropagation()
    setDropIndex(undefined)
    const kind = e.dataTransfer.getData(KIND_MIME) as BlockKind
    const from = e.dataTransfer.getData(INDEX_MIME)
    if (kind) insert(kind, index)
    else if (from !== '') {
      const fromIndex = Number(from)
      // Removing the dragged item first shifts later indexes down by one.
      move(fromIndex, index > fromIndex ? index - 1 : index)
    }
  }

  const save = async () => {
    setSaving(true)
    try {
      await onSave(doc)
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="screen editor">
      <button className="btn btn-ghost back" onClick={onBack}>
        ← Back
      </button>
      <h1>{initial ? 'Edit workout' : 'New workout'}</h1>
      <div className="editor-top">
        <input
          className="editor-name"
          placeholder="Workout name"
          aria-label="Workout name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <span className="editor-total">
          <span className="muted">Total</span> {formatDuration(blocksDuration(blocks))}
        </span>
        <button className="btn btn-primary" disabled={!valid || saving} onClick={save}>
          Save
        </button>
      </div>

      {items.length > 0 && <PowerProfileChart workout={preview} height={100} />}

      <div className="palette">
        {PALETTE.map(({ kind, label }) => (
          <button
            key={kind}
            className="btn palette-item"
            disabled={full}
            draggable={!full}
            onDragStart={(e) => {
              e.dataTransfer.setData(KIND_MIME, kind)
              e.dataTransfer.effectAllowed = 'copy'
            }}
            onDragEnd={() => setDropIndex(undefined)}
            onClick={() => insert(kind)}
          >
            + {label}
          </button>
        ))}
      </div>
      <p className="hint">
        Drag a block into the workout, or click it to add it at the end ({items.length}/
        {LIMITS.blocks} blocks).
      </p>
      {tooMany && (
        <p className="message-error">
          A workout can have at most {LIMITS.blocks} blocks. Remove {items.length - LIMITS.blocks}{' '}
          to save.
        </p>
      )}
      {textEvents.length > 0 && (
        <p className="hint">
          This workout has {textEvents.length} text messages. They stay at their original times.
        </p>
      )}

      <ol
        className="blocks"
        onDragOver={(e) => onDragOver(e, items.length)}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropIndex(undefined)
        }}
        onDrop={(e) => onDrop(e, items.length)}
      >
        {items.map((item, index) => (
          <li
            key={item.id}
            className={`block block-${item.block.kind} ${dropIndex === index ? 'drop-before' : ''}`}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData(INDEX_MIME, String(index))
              e.dataTransfer.effectAllowed = 'move'
            }}
            onDragEnd={() => setDropIndex(undefined)}
            onDragOver={(e) => onDragOver(e, index)}
            onDrop={(e) => onDrop(e, index)}
          >
            <div className="block-head">
              <span className="block-grip" aria-hidden>
                ⋮⋮
              </span>
              <strong>{LABELS[item.block.kind]}</strong>
              <span className="muted">{formatDuration(blockDuration(item.block))}</span>
              <span className="block-actions">
                <button
                  className="btn btn-ghost"
                  aria-label="Move up"
                  disabled={index === 0}
                  onClick={() => move(index, index - 1)}
                >
                  ↑
                </button>
                <button
                  className="btn btn-ghost"
                  aria-label="Move down"
                  disabled={index === items.length - 1}
                  onClick={() => move(index, index + 1)}
                >
                  ↓
                </button>
                <button
                  className="btn btn-ghost"
                  aria-label={`Delete ${LABELS[item.block.kind]}`}
                  onClick={() => remove(item.id)}
                >
                  🗑
                </button>
              </span>
            </div>
            <BlockFields block={item.block} onChange={(block) => update(item.id, block)} />
            {blockErrors(item.block).length > 0 && (
              <ul className="messages block-errors">
                {blockErrors(item.block).map((error) => (
                  <li key={error} className="message-error">
                    {error}
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
        <li className={`blocks-end ${dropIndex === items.length ? 'drop-before' : ''}`}>
          {items.length === 0 ? 'Drop blocks here' : ''}
        </li>
      </ol>
    </section>
  )
}

function BlockFields({ block, onChange }: { block: Block; onChange: (block: Block) => void }) {
  switch (block.kind) {
    case 'steady':
      return (
        <div className="block-fields">
          <DurationField
            label="Duration"
            max={maxDuration(block.kind)}
            value={block.duration}
            onChange={(duration) => onChange({ ...block, duration })}
          />
          <PowerField
            label="Power"
            value={block.power}
            onChange={(power) => onChange({ ...block, power })}
          />
        </div>
      )
    case 'freeride':
    case 'maxeffort':
      return (
        <div className="block-fields">
          <DurationField
            label="Duration"
            max={maxDuration(block.kind)}
            value={block.duration}
            onChange={(duration) => onChange({ ...block, duration })}
          />
        </div>
      )
    case 'warmup':
    case 'cooldown':
    case 'ramp':
      return (
        <div className="block-fields">
          <DurationField
            label="Duration"
            max={maxDuration(block.kind)}
            value={block.duration}
            onChange={(duration) => onChange({ ...block, duration })}
          />
          <PowerField
            label="From"
            value={block.powerStart}
            onChange={(powerStart) => onChange({ ...block, powerStart })}
          />
          <PowerField
            label="To"
            value={block.powerEnd}
            onChange={(powerEnd) => onChange({ ...block, powerEnd })}
          />
        </div>
      )
    case 'interval':
      return (
        <div className="block-fields">
          <NumberField
            label="Repeat"
            unit="×"
            value={block.repeat}
            min={1}
            max={LIMITS.intervalRepeat}
            onChange={(repeat) => onChange({ ...block, repeat })}
          />
          <DurationField
            label="On"
            max={maxDuration(block.kind)}
            value={block.onDuration}
            onChange={(onDuration) => onChange({ ...block, onDuration })}
          />
          <PowerField
            label="On power"
            value={block.onPower}
            onChange={(onPower) => onChange({ ...block, onPower })}
          />
          <DurationField
            label="Off"
            max={maxDuration(block.kind)}
            value={block.offDuration}
            onChange={(offDuration) => onChange({ ...block, offDuration })}
          />
          <PowerField
            label="Off power"
            value={block.offPower}
            onChange={(offPower) => onChange({ ...block, offPower })}
          />
        </div>
      )
  }
}

type DurationUnit = 'min' | 's'

/** Seconds, edited in minutes or seconds. */
function DurationField({
  label,
  value,
  max,
  onChange,
}: {
  label: string
  value: number
  /** Seconds. */
  max: number
  onChange: (seconds: number) => void
}) {
  const [unit, setUnit] = useState<DurationUnit>(value > 0 && value % 60 === 0 ? 'min' : 's')
  const factor = unit === 'min' ? 60 : 1
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <span className="field-inputs">
        <NumberInput
          value={value / factor}
          decimals={unit === 'min'}
          max={max / factor}
          onChange={(n) => onChange(Math.round(n * factor))}
        />
        <select
          className="field-select"
          aria-label={`${label} unit`}
          value={unit}
          onChange={(e) => setUnit(e.target.value as DurationUnit)}
        >
          <option value="min">min</option>
          <option value="s">s</option>
        </select>
      </span>
    </label>
  )
}

/** Fraction of FTP, edited as a percentage. */
function PowerField({
  label,
  value,
  onChange,
}: {
  label: string
  value: number
  onChange: (power: number) => void
}) {
  return (
    <NumberField
      label={label}
      unit="% FTP"
      value={Math.round(value * 100)}
      min={1}
      onChange={(pct) => onChange(pct / 100)}
    />
  )
}

function NumberField({
  label,
  unit,
  ...input
}: {
  label: string
  unit: string
  value: number
  min?: number
  max?: number
  onChange: (value: number) => void
}) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <span className="field-inputs">
        <NumberInput {...input} />
        <span className="field-unit">{unit}</span>
      </span>
    </label>
  )
}

/**
 * Non-negative number input, integer unless `decimals`. Keeps the raw text while typing so the
 * field can be cleared, and reports 0 for an empty field.
 */
function NumberInput({
  value,
  decimals = false,
  onChange,
  ...rest
}: {
  value: number
  decimals?: boolean
  min?: number
  max?: number
  onChange: (value: number) => void
}) {
  const format = (n: number) => String(Math.round(n * 100) / 100)
  const [text, setText] = useState(format(value))
  // Resync when the value changes from outside (e.g. switching the duration unit).
  const [synced, setSynced] = useState(value)
  if (value !== synced) {
    setSynced(value)
    setText(format(value))
  }
  return (
    <input
      type="number"
      inputMode={decimals ? 'decimal' : 'numeric'}
      step={decimals ? 'any' : 1}
      className="field-input"
      value={text}
      onChange={(e) => {
        setText(e.target.value)
        const parsed = e.target.value === '' ? 0 : Number(e.target.value)
        if ((decimals ? Number.isFinite(parsed) : Number.isInteger(parsed)) && parsed >= 0) {
          setSynced(parsed)
          onChange(parsed)
        }
      }}
      onBlur={() => setText(format(value))}
      {...rest}
    />
  )
}
