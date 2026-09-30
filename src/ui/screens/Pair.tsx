import type { ReactNode } from 'react'
import { isWebBluetoothAvailable } from '../../trainer/ftms/ftms-trainer'
import { HeartIcon, TrainerIcon } from '../components/DeviceIcons'
import { useHeartRateMonitor } from '../hooks/useHeartRateMonitor'
import { useTrainer } from '../hooks/useTrainer'

interface Props {
  onStart: () => void
  onSimulatedChange: (simulated: boolean) => void
}

/** First screen: pair the trainer (required) and the heart rate strap (optional). */
export function Pair({ onStart, onSimulatedChange }: Props) {
  const trainer = useTrainer()
  const hrm = useHeartRateMonitor()
  const available = isWebBluetoothAvailable() || trainer.simulated

  return (
    <section className="screen pair">
      <div className="pair-card">
        <div className="pair-devices">
          <DeviceButton
            icon={<TrainerIcon />}
            kind="Trainer"
            status={trainer.status}
            name={trainer.name}
            connected={trainer.ready}
            disabled={!available}
            onConnect={() => void trainer.session.connect()}
            onDisconnect={() => void trainer.session.disconnect()}
          />
          <DeviceButton
            icon={<HeartIcon />}
            kind="Heart rate"
            status={hrm.status}
            name={hrm.name}
            connected={hrm.status === 'connected'}
            disabled={!available}
            onConnect={() => void hrm.session.connect()}
            onDisconnect={() => void hrm.session.disconnect()}
          />
        </div>
        <div className="pair-start">
          <button className="btn btn-primary btn-large" disabled={!trainer.ready} onClick={onStart}>
            Start
          </button>
          <label className="toggle">
            <input
              type="checkbox"
              checked={trainer.simulated}
              onChange={(e) => onSimulatedChange(e.target.checked)}
            />
            Virtual
          </label>
        </div>
      </div>
    </section>
  )
}

interface DeviceButtonProps {
  icon: ReactNode
  kind: string
  status: string
  name?: string
  connected: boolean
  disabled: boolean
  onConnect: () => void
  onDisconnect: () => void
}

/** Pairs the device on click, or disconnects it once paired. */
function DeviceButton({
  icon,
  kind,
  status,
  name,
  connected,
  disabled,
  onConnect,
  onDisconnect,
}: DeviceButtonProps) {
  const connecting = status === 'connecting'
  const label = connecting ? 'Connecting…' : connected ? (name ?? 'Connected') : 'Pair'
  return (
    <button
      className={`device device-${status}`}
      onClick={connected ? onDisconnect : onConnect}
      disabled={disabled || connecting}
      aria-label={connected ? `Disconnect ${kind.toLowerCase()}` : `Pair ${kind.toLowerCase()}`}
      title={connected ? 'Click to disconnect' : undefined}
    >
      <span className="device-icon">{icon}</span>
      <span className="device-kind">{kind}</span>
      <span className="device-label">
        <span className={`status-dot status-${status}`} aria-hidden />
        {label}
      </span>
    </button>
  )
}
