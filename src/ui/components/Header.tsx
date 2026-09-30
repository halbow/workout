import type { HeartRateMonitorStatus } from '../../heart-rate'
import { isWebBluetoothAvailable } from '../../trainer/ftms/ftms-trainer'
import type { TrainerStatus } from '../../trainer/types'
import { useHeartRateMonitor } from '../hooks/useHeartRateMonitor'
import { useTrainer } from '../hooks/useTrainer'

const STATUS_LABEL: Record<TrainerStatus, string> = {
  disconnected: 'Not paired',
  connecting: 'Connecting',
  connected: 'ERG off',
  controlling: 'Controlling',
  error: 'Error',
}

const HR_STATUS_LABEL: Record<HeartRateMonitorStatus, string> = {
  disconnected: 'Not paired',
  connecting: 'Connecting',
  connected: 'Connected',
  error: 'Error',
}

interface Props {
  /** Hidden on the pairing screen, which shows the devices itself. */
  showStatus: boolean
  /** Opens the pairing screen. */
  onPair: () => void
  onSettings: () => void
  /** Pairing and settings are disabled during a ride. */
  locked: boolean
}

export function Header({ showStatus, onPair, onSettings, locked }: Props) {
  const { status, name, simulated, error, session } = useTrainer()
  const hrm = useHeartRateMonitor()
  const bluetooth = isWebBluetoothAvailable()
  const trainerReady = status === 'connected' || status === 'controlling'

  return (
    <header className="header">
      <div className="header-row">
        {showStatus ? (
          <button className="device-status" onClick={onPair} disabled={locked} aria-label="Devices">
            <span className="device-status-row">
              <span className={`status-dot status-${status}`} aria-hidden />
              Trainer · {trainerReady && name ? name : STATUS_LABEL[status]}
            </span>
            <span className="device-status-row">
              <span className={`status-dot status-${hrm.status}`} aria-hidden />
              HR · {hrm.status === 'connected' && hrm.name ? hrm.name : HR_STATUS_LABEL[hrm.status]}
            </span>
          </button>
        ) : (
          <span />
        )}
        <button
          className="btn btn-ghost"
          onClick={onSettings}
          disabled={locked}
          aria-label="Settings"
        >
          ⚙︎
        </button>
      </div>
      {!bluetooth && !simulated && (
        <div className="banner banner-warn">
          This browser does not support Web Bluetooth. Use Chrome or Edge on desktop, or turn on the
          virtual devices.
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
      {hrm.error && (
        <div className="banner banner-error">
          <span>{hrm.error}</span>
          <button className="btn btn-ghost" onClick={hrm.session.clearError} aria-label="Dismiss">
            ✕
          </button>
        </div>
      )}
    </header>
  )
}
