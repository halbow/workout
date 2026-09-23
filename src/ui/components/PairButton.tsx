import { useTrainer } from '../hooks/useTrainer'

export function PairButton() {
  const { session, status } = useTrainer()
  switch (status) {
    case 'connecting':
      return (
        <button className="btn" disabled>
          Connecting…
        </button>
      )
    case 'connected':
    case 'controlling':
      return (
        <button className="btn btn-secondary" onClick={() => void session.disconnect()}>
          Disconnect
        </button>
      )
    default:
      return (
        <button className="btn btn-primary" onClick={() => void session.connect()}>
          Pair trainer
        </button>
      )
  }
}
