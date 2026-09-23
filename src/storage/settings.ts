const KEY = 'erg-player:settings'

export interface Settings {
  /** Watts. Undefined until the rider sets it. */
  ftp?: number
  simulatedTrainer: boolean
}

const DEFAULTS: Settings = { simulatedTrainer: false }

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Settings>) } : DEFAULTS
  } catch {
    return DEFAULTS
  }
}

export function saveSettings(settings: Settings) {
  localStorage.setItem(KEY, JSON.stringify(settings))
}
