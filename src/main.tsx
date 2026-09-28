import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { consoleSink, log } from './logging'
import { logRecorder } from './storage/logs'
import { loadSettings } from './storage/settings'
import { App } from './ui/App'
import './ui/styles.css'

log.level = loadSettings().logLevel
log.addSink(consoleSink())
log.addSink(logRecorder.write)
window.addEventListener('pagehide', () => void logRecorder.flush())
window.addEventListener('error', (e) => log.log('error', 'window', e.message, e.error))
window.addEventListener('unhandledrejection', (e) =>
  log.log('error', 'window', 'unhandled rejection', e.reason),
)
log.log('info', 'app', 'started', { level: log.level, userAgent: navigator.userAgent })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
