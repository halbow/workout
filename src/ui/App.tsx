import { useEffect, useState } from 'react'
import { loadSettings, saveSettings, type Settings as SettingsData } from '../storage/settings'
import { deleteWorkout, listWorkouts, saveWorkout, type SavedWorkout } from '../storage/workouts'
import type { Workout } from '../workout'
import { Header } from './components/Header'
import { TrainerSessionContext } from './hooks/useTrainer'
import { Library } from './screens/Library'
import { Ride } from './screens/Ride'
import { Settings } from './screens/Settings'
import { WorkoutDetail } from './screens/WorkoutDetail'
import { TrainerSession } from './trainer-session'

type Route =
  | { screen: 'library' }
  | { screen: 'detail'; id: string }
  | { screen: 'ride'; id: string }
  | { screen: 'settings'; back: Route }

export function App() {
  const [settings, setSettings] = useState<SettingsData>(loadSettings)
  const [session] = useState(() => new TrainerSession(settings.simulatedTrainer))
  const [workouts, setWorkouts] = useState<SavedWorkout[]>([])
  const [route, setRoute] = useState<Route>(() =>
    settings.ftp === undefined
      ? { screen: 'settings', back: { screen: 'library' } }
      : { screen: 'library' },
  )

  useEffect(() => {
    void listWorkouts().then(setWorkouts)
  }, [])

  const updateSettings = (patch: Partial<SettingsData>) => {
    const next = { ...settings, ...patch }
    setSettings(next)
    saveSettings(next)
  }

  const onImport = async (imported: Workout[]) => {
    for (const w of imported) await saveWorkout(w)
    setWorkouts(await listWorkouts())
  }

  const onDelete = async (id: string) => {
    await deleteWorkout(id)
    setWorkouts(await listWorkouts())
  }

  const current = 'id' in route ? workouts.find((w) => w.id === route.id) : undefined
  const home = () => setRoute({ screen: 'library' })

  let screen
  if (route.screen === 'settings') {
    screen = (
      <Settings
        ftp={settings.ftp}
        onSave={(ftp) => {
          updateSettings({ ftp })
          setRoute(route.back)
        }}
        onBack={() => setRoute(route.back)}
      />
    )
  } else if (route.screen === 'ride' && current && settings.ftp !== undefined) {
    screen = (
      <Ride
        workout={current.workout}
        ftp={settings.ftp}
        onExit={() => setRoute({ screen: 'detail', id: current.id })}
      />
    )
  } else if (route.screen === 'detail' && current) {
    screen = (
      <WorkoutDetail
        workout={current.workout}
        ftp={settings.ftp}
        onStart={() => setRoute({ screen: 'ride', id: current.id })}
        onBack={home}
        onSettings={() => setRoute({ screen: 'settings', back: route })}
      />
    )
  } else {
    screen = (
      <Library
        workouts={workouts}
        onImport={onImport}
        onOpen={(id) => setRoute({ screen: 'detail', id })}
        onDelete={(id) => void onDelete(id)}
      />
    )
  }

  return (
    <TrainerSessionContext.Provider value={session}>
      <div className="app">
        <Header
          onHome={home}
          onSettings={() => setRoute({ screen: 'settings', back: route })}
          locked={route.screen === 'ride'}
          onSimulatedChange={(simulatedTrainer) => {
            updateSettings({ simulatedTrainer })
            void session.setSimulated(simulatedTrainer)
          }}
        />
        <main>{screen}</main>
      </div>
    </TrainerSessionContext.Provider>
  )
}
