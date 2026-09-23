import { isWebBluetoothAvailable } from '../../trainer/ftms/ftms-trainer'
import type { TrainerStatus } from '../../trainer/types'
import { useTrainer } from '../hooks/useTrainer'
import { PairButton } from './PairButton'

const STATUS_LABEL: Record<TrainerStatus, string> = {
  disconnected: 'Not paired',
  connecting: 'Connecting',
  connected: 'Connected (ERG off)',
  controlling: 'Controlling',
  error: 'Error',
}

interface Props {
  onHome: () => void
  onSettings: () => void
  /** Switching trainers is disabled during a ride. */
  locked: boolean
  onSimulatedChange: (simulated: boolean) => void
}

export function Header({ onHome, onSettings, locked, onSimulatedChange }: Props) {
  const { status, name, simulated, error, session } = useTrainer()
  const bluetooth = isWebBluetoothAvailable()

  return (
    <header className="header">
      <div className="header-row">
        <button className="brand" onClick={onHome} disabled={locked}>
          ERG Player
        </button>
        <div className="trainer-status">
          <span className={`status-dot status-${status}`} aria-hidden />
          <span>
            {STATUS_LABEL[status]}
            {name && (status === 'connected' || status === 'controlling') ? ` · ${name}` : ''}
          </span>
        </div>
        <div className="header-actions">
          {!locked && (bluetooth || simulated) && <PairButton />}
          <button
            className="btn btn-ghost"
            onClick={onSettings}
            disabled={locked}
            aria-label="Settings"
          >
            ⚙︎
          </button>
        </div>
      </div>
      <label className="toggle">
        <input
          type="checkbox"
          checked={simulated}
          disabled={locked}
          onChange={(e) => onSimulatedChange(e.target.checked)}
        />
        Use simulated trainer
      </label>
      {!bluetooth && !simulated && (
        <div className="banner banner-warn">
          This browser does not support Web Bluetooth. Use Chrome or Edge on desktop, or turn on the
          simulated trainer.
        </div>
      )}
      {error && (
        <div className="banner banner-error">
          <span>{error}</span>
          <button className="btn btn-ghost" onClick={session.clearError} aria-label="Dismiss">
            ✕
          </button>
        </div>
      )}
    </header>
  )
}
