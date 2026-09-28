import { useEffect, useState } from 'react'
import { log } from '../logging'
import { loadSettings, saveSettings, type Settings as SettingsData } from '../storage/settings'
import {
  deleteWorkout,
  listWorkouts,
  saveWorkout,
  updateWorkout,
  type SavedWorkout,
} from '../storage/workouts'
import { parseZwoDocument, serializeZwo, type ZwoDocument } from '../workout'
import { Header } from './components/Header'
import { TrainerSessionContext } from './hooks/useTrainer'
import { Library } from './screens/Library'
import { Ride } from './screens/Ride'
import { Settings } from './screens/Settings'
import { WorkoutEditor } from './screens/WorkoutEditor'
import { WorkoutDetail } from './screens/WorkoutDetail'
import { TrainerSession } from './trainer-session'

type Route =
  | { screen: 'library' }
  /** Without an id, creates a new workout. */
  | { screen: 'editor'; id?: string }
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

  const onImport = async (files: string[]) => {
    for (const zwo of files) await saveWorkout(zwo)
    setWorkouts(await listWorkouts())
  }

  const onSaveEditor = async (doc: ZwoDocument, id?: string) => {
    const zwo = serializeZwo(doc)
    if (id) await updateWorkout(id, zwo)
    else await saveWorkout(zwo)
    setWorkouts(await listWorkouts())
    setRoute(id ? { screen: 'detail', id } : { screen: 'library' })
  }

  const onDelete = async (id: string) => {
    await deleteWorkout(id)
    setWorkouts(await listWorkouts())
  }

  const current = 'id' in route ? workouts.find((w) => w.id === route.id) : undefined
  const back = () =>
    setRoute(current ? { screen: 'detail', id: current.id } : { screen: 'library' })
  const home = () => setRoute({ screen: 'library' })

  let screen
  if (route.screen === 'settings') {
    screen = (
      <Settings
        ftp={settings.ftp}
        logLevel={settings.logLevel}
        onLogLevelChange={(logLevel) => {
          updateSettings({ logLevel })
          log.level = logLevel
        }}
        showDefaultWorkouts={settings.showDefaultWorkouts}
        onShowDefaultWorkoutsChange={(showDefaultWorkouts) =>
          updateSettings({ showDefaultWorkouts })
        }
        onSave={(ftp) => {
          updateSettings({ ftp })
          setRoute(route.back)
        }}
        onBack={() => setRoute(route.back)}
      />
    )
  } else if (route.screen === 'editor') {
    screen = (
      <WorkoutEditor
        key={current?.id ?? 'new'}
        initial={current && parseZwoDocument(current.zwo)}
        onSave={(doc) => onSaveEditor(doc, current?.isDefault ? undefined : current?.id)}
        onBack={back}
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
        zwo={current.zwo}
        ftp={settings.ftp}
        isDefault={current.isDefault}
        onStart={() => setRoute({ screen: 'ride', id: current.id })}
        onEdit={() => setRoute({ screen: 'editor', id: current.id })}
        onBack={home}
        onSettings={() => setRoute({ screen: 'settings', back: route })}
      />
    )
  } else {
    screen = (
      <Library
        workouts={settings.showDefaultWorkouts ? workouts : workouts.filter((w) => !w.isDefault)}
        onImport={onImport}
        onCreate={() => setRoute({ screen: 'editor' })}
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
