import { useEffect, useRef, useState } from 'react'
import { formatEntry, log, type LogEntry } from '../../logging'
import type { FeatureFlag } from '../../trainer/ftms/codec'
import { isWebBluetoothAvailable } from '../../trainer/ftms/ftms-trainer'
import { formatUuid, inspectDevice, type DeviceReport } from '../../trainer/ftms/inspector'
import { useTrainer } from '../hooks/useTrainer'
import { PairButton } from './PairButton'

const LIVE_LOG_LINES = 300

/** Features the app reads or controls. Supported ones not listed here are features we miss. */
const USED_FEATURES = new Set(['Cadence', 'Power measurement', 'Heart rate', 'Power target (ERG)'])

/** Hidden in Settings: live logs, pairing and what the trainer supports. */
export function BleDebugPanel() {
  return (
    <div className="log-panel ble-debug">
      <h2>Bluetooth debug</h2>
      <ConnectionSection />
      <InspectSection />
      <LiveLog />
    </div>
  )
}

function ConnectionSection() {
  const { status, name, simulated, error } = useTrainer()
  return (
    <div className="ble-section">
      <h3>Trainer</h3>
      <p>
        Status: <strong>{status}</strong>
        {name ? ` · ${name}` : ''}
        {simulated ? ' (simulated)' : ''}
      </p>
      {error && <p className="message-error">{error}</p>}
      {(isWebBluetoothAvailable() || simulated) && <PairButton />}
      <p className="hint">
        Pairs the same way as the pairing screen. Every step shows in the logs.
      </p>
    </div>
  )
}

function InspectSection() {
  const [allDevices, setAllDevices] = useState(false)
  const [busy, setBusy] = useState(false)
  const [report, setReport] = useState<DeviceReport>()
  const [error, setError] = useState<string>()

  const inspect = async () => {
    setBusy(true)
    setError(undefined)
    try {
      setReport(await inspectDevice({ allDevices }))
    } catch (e) {
      // Closing the picker is not an error.
      if (!(e instanceof DOMException && e.name === 'NotFoundError')) {
        setError(e instanceof Error ? e.message : String(e))
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="ble-section">
      <h3>Supported features</h3>
      <label className="toggle">
        <input
          type="checkbox"
          checked={allDevices}
          onChange={(e) => setAllDevices(e.target.checked)}
        />
        Show every Bluetooth device, not only FTMS trainers
      </label>
      <button
        className="btn btn-secondary"
        onClick={() => void inspect()}
        disabled={busy || !isWebBluetoothAvailable()}
      >
        {busy ? 'Reading…' : 'Read device features'}
      </button>
      <p className="hint">
        Read only: sends no command, and leaves the connection open if the trainer is paired.
      </p>
      {error && <p className="message-error">{error}</p>}
      {report && <Report report={report} />}
    </div>
  )
}

function Report({ report }: { report: DeviceReport }) {
  const missed = report.features
    ? [...report.features.machine, ...report.features.targetSettings].filter(
        (f) => f.supported && !USED_FEATURES.has(f.name),
      )
    : []

  return (
    <div className="ble-report">
      <dl className="ble-facts">
        <Fact label="Name" value={report.name ?? '—'} />
        {report.info.map(({ label, value }) => (
          <Fact key={label} label={label} value={value} />
        ))}
        {report.batteryLevel !== undefined && (
          <Fact label="Battery" value={`${report.batteryLevel} %`} />
        )}
        {report.powerRange && (
          <Fact
            label="Power range"
            value={`${report.powerRange.min}–${report.powerRange.max} W, by ${report.powerRange.increment} W`}
          />
        )}
        {report.resistanceRange && (
          <Fact
            label="Resistance range"
            value={`${report.resistanceRange.min}–${report.resistanceRange.max}, by ${report.resistanceRange.increment}`}
          />
        )}
        {report.features && <Fact label="Feature bytes" value={report.features.hex} />}
      </dl>

      {report.features ? (
        <>
          {missed.length > 0 && (
            <p className="message-warn">
              Supported but not used by the app: {missed.map((f) => f.name).join(', ')}.
            </p>
          )}
          <FeatureTable title="Machine features" flags={report.features.machine} />
          <FeatureTable title="Target settings" flags={report.features.targetSettings} />
        </>
      ) : (
        <p className="message-warn">No FTMS feature characteristic: this is not an FTMS trainer.</p>
      )}

      <h4>Services</h4>
      <ul className="ble-services">
        {report.services.map((service) => (
          <li key={service.uuid}>
            <strong>{service.name ?? 'Unknown service'}</strong>{' '}
            <code>{formatUuid(service.uuid)}</code>
            <ul>
              {service.characteristics.map((c) => (
                <li key={c.uuid}>
                  {c.name ?? 'Unknown'} <code>{formatUuid(c.uuid)}</code>{' '}
                  <span className="muted">{c.properties.join(', ')}</span>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
      <p className="hint">
        Only standard services are listed: browsers hide the ones not asked for when picking the
        device.
      </p>
    </div>
  )
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </>
  )
}

function FeatureTable({ title, flags }: { title: string; flags: FeatureFlag[] }) {
  return (
    <>
      <h4>{title}</h4>
      <ul className="ble-features">
        {flags.map((f) => (
          <li key={f.name} className={f.supported ? '' : 'muted'}>
            <span aria-hidden>{f.supported ? '✓' : '·'}</span> {f.name}
            {f.supported && USED_FEATURES.has(f.name) && <span className="ble-used">used</span>}
            {f.supported && !USED_FEATURES.has(f.name) && (
              <span className="ble-missed">not used</span>
            )}
          </li>
        ))}
      </ul>
    </>
  )
}

function LiveLog() {
  const [entries, setEntries] = useState<LogEntry[]>([])
  const [paused, setPaused] = useState(false)
  const [showData, setShowData] = useState(true)
  const box = useRef<HTMLPreElement>(null)

  useEffect(() => {
    if (paused) return
    return log.observe((entry) =>
      setEntries((previous) => [...previous.slice(1 - LIVE_LOG_LINES), entry]),
    )
  }, [paused])

  const shown = showData ? entries : entries.filter((e) => e.level !== 'debug')

  useEffect(() => {
    const el = box.current
    if (el) el.scrollTop = el.scrollHeight
  }, [entries, showData])

  return (
    <div className="ble-section">
      <h3>Live logs</h3>
      <div className="ble-log-actions">
        <button className="btn btn-secondary" onClick={() => setPaused(!paused)}>
          {paused ? 'Resume' : 'Pause'}
        </button>
        <button className="btn btn-secondary" onClick={() => setEntries([])}>
          Clear
        </button>
        <label className="toggle">
          <input
            type="checkbox"
            checked={showData}
            onChange={(e) => setShowData(e.target.checked)}
          />
          Show data readings
        </label>
      </div>
      <pre className="ble-log" ref={box}>
        {shown.length === 0 ? (
          <span className="muted">Waiting for log entries…</span>
        ) : (
          shown.map((entry, i) => (
            <div key={i} className={`ble-log-${entry.level}`}>
              {formatEntry(entry)}
            </div>
          ))
        )}
      </pre>
      <p className="hint">
        Every entry, whatever the log level. The last {LIVE_LOG_LINES} are kept while this panel is
        open.
      </p>
    </div>
  )
}
