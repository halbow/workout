# ERG Workout Player: Plan

A browser app that imports Zwift workout files (`.zwo`), pairs with a Wahoo KICKR Core over Web Bluetooth, and runs structured interval workouts in ERG mode (the trainer holds the target watts).

No backend: everything runs in the browser.

## Goals (iteration 1)

- Import a `.zwo` file and show the workout (steps + power profile).
- Pair with the KICKR Core (Bluetooth FTMS).
- Start / pause / resume / stop a workout; the trainer follows the target watts.
- Show live data: target power, current power, cadence, step time left, total time left, next step.
- Desktop first (Chrome / Edge), with a layout that already works on mobile screens.
- Dev server runnable in a container.

### Out of scope (later iterations)

- PWA / offline install, mobile browsers (Android Chrome, Bluefy on iPhone)
- Ride recording and `.fit` export (Strava / intervals.icu)
- SIM mode, virtual shifting, Zwift Click support
- Workout editor (import only for now)
- ANT+ (not accessible from browsers)

## Stack

| Concern | Choice | Why |
|---|---|---|
| Build / dev server | Vite | Fast, simple, `localhost` counts as a secure context (needed for Web Bluetooth) |
| Language | TypeScript (strict) | Typed binary protocol + domain model |
| UI | React | Already known (jacket), thin layer over framework-free core modules |
| Tests | Vitest | Same as jacket; the core modules are pure and testable without a trainer |
| Bluetooth | Web Bluetooth API + `@types/web-bluetooth` | Only way to talk to BLE from a browser; Chrome / Edge only |
| Storage | `localStorage` (FTP, settings) + IndexedDB via `idb-keyval` (workouts) | No backend |
| Container | `node:22-alpine`, `vite --host`, port 5173 mapped to host | The browser on the host opens `http://localhost:5173`, which is a secure context, so Bluetooth works |

## Architecture

```
            ┌──────────────┐
 .zwo file ─▶  workout/     │  parse XML → Workout (pure data)
            └──────┬───────┘
                   │ Workout
            ┌──────▼───────┐   setTargetPower(watts)   ┌──────────────┐
            │  runner/     ├──────────────────────────▶│  trainer/    │──BLE──▶ KICKR Core
            │  (timing,    │◀──────────────────────────┤  (FTMS)      │
            │   targets)   │   TrainerData (power,     └──────────────┘
            └──────┬───────┘   cadence)
                   │ RunnerSnapshot (subscribe)
            ┌──────▼───────┐
            │  ui/ (React) │
            └──────────────┘
```

Rule: `workout/`, `trainer/` and `runner/` are **plain TypeScript with no React or DOM imports**, except `trainer/ftms/` which uses `navigator.bluetooth`. The dependencies only go in one direction: `ui → runner → (workout, trainer)`.

```
src/
├── workout/
│   ├── types.ts            # Workout, Segment, TextEvent
│   ├── zwo-parser.ts       # parseZwo(xml: string): Workout  (throws ZwoParseError)
│   ├── duration.ts         # totalDuration, segmentAt(t), powerAt(t)
│   └── __tests__/ + fixtures/*.zwo
├── trainer/
│   ├── types.ts            # Trainer interface, TrainerData, TrainerStatus
│   ├── ftms/
│   │   ├── uuids.ts        # service / characteristic UUIDs
│   │   ├── codec.ts        # pure encode/decode of FTMS bytes (unit-tested)
│   │   └── ftms-trainer.ts # Web Bluetooth implementation of Trainer
│   └── mock-trainer.ts     # simulated trainer for dev and tests
├── runner/
│   ├── clock.ts            # Clock interface (real + fake for tests)
│   ├── workout-runner.ts   # state machine + tick loop
│   └── __tests__/
└── ui/
    ├── App.tsx
    ├── hooks/              # useTrainer, useRunner (useSyncExternalStore)
    ├── screens/            # Library, WorkoutDetail, Ride, Settings
    └── components/         # PowerProfileChart (SVG), BigMetric, PairButton
```

## Module 1: `workout/` (.zwo → internal model)

### `.zwo` format (XML)

```xml
<workout_file>
  <author>…</author><name>…</name><description>…</description>
  <sportType>bike</sportType>
  <workout>
    <Warmup    Duration="600" PowerLow="0.40" PowerHigh="0.75"/>
    <SteadyState Duration="300" Power="0.88" Cadence="90"/>
    <IntervalsT Repeat="5" OnDuration="180" OffDuration="120" OnPower="1.05" OffPower="0.55"/>
    <Ramp      Duration="300" PowerLow="0.60" PowerHigh="0.90"/>
    <FreeRide  Duration="600"/>
    <Cooldown  Duration="600" PowerLow="0.70" PowerHigh="0.40"/>
    <!-- any element can contain <textevent timeoffset="10" message="…"/> -->
  </workout>
</workout_file>
```

Power values are fractions of FTP. Durations are in seconds.

### Internal model

```ts
type Segment =
  | { kind: 'steady'; duration: number; power: number; cadence?: number }
  | { kind: 'ramp'; duration: number; powerStart: number; powerEnd: number; cadence?: number }
  | { kind: 'free'; duration: number }            // ERG off, rider controls effort

interface Workout {
  name: string; author?: string; description?: string
  segments: Segment[]         // flattened, in order
  textEvents: TextEvent[]     // absolute time offsets (seconds from start)
}
```

- `IntervalsT` is flattened into alternating `steady` segments (with a `group` label kept for display, e.g. "Interval 2/5").
- `Warmup`, `Cooldown` and `Ramp` become `ramp` segments. `Cooldown` sometimes has `PowerLow > PowerHigh`, so keep the attribute order as written.
- `MaxEffort` becomes a `free` segment.
- Unknown elements produce a parse warning and are skipped. Non-bike `sportType` is an error.
- Parsing uses the browser's `DOMParser` (use `happy-dom` or `jsdom` in Vitest).

### Tests

Fixtures for each element type, a real-world file, malformed XML, missing attributes, and flattening of `IntervalsT`. `powerAt(t)` at segment boundaries and mid-ramp.

## Module 2: `trainer/` (Bluetooth FTMS)

### Interface

```ts
interface Trainer {
  readonly status: TrainerStatus          // 'disconnected' | 'connecting' | 'connected' | 'controlling' | 'error'
  connect(): Promise<void>                // must be called from a user gesture (button click)
  disconnect(): Promise<void>
  setTargetPower(watts: number): Promise<void>
  releaseControl(): Promise<void>         // ERG off (used for FreeRide)
  subscribe(listener: (e: TrainerEvent) => void): () => void   // data + status events
}
interface TrainerData { power?: number; cadence?: number; speed?: number; timestamp: number }
```

### FTMS protocol (Fitness Machine Service `0x1826`)

| Characteristic | UUID | Use |
|---|---|---|
| Fitness Machine Control Point | `0x2AD9` | write commands, indications carry responses |
| Indoor Bike Data | `0x2AD2` | notifications: power, cadence, speed |
| Fitness Machine Status | `0x2ADA` | notifications: trainer-side state changes |
| Fitness Machine Feature | `0x2ACC` | check "power target setting supported" |

Control point commands:

| Op code | Command | Payload |
|---|---|---|
| `0x00` | Request Control | none |
| `0x01` | Reset | none |
| `0x05` | Set Target Power | sint16 LE, watts |
| `0x07` | Start / Resume | none |
| `0x08` | Stop / Pause | uint8 (1 = stop, 2 = pause) |
| `0x80` | Response (from trainer) | request op code + result (`0x01` = success) |

Connection sequence: `requestDevice({ filters: [{ services: [0x1826] }] })` → connect GATT → enable indications on the control point → enable notifications on Indoor Bike Data → Request Control → Start.

Implementation rules:
- **Command queue:** send one control point write at a time and wait for its `0x80` response (with a timeout) before sending the next.
- **Rate limit** `setTargetPower`: at most one per second; skip it if the value hasn't changed.
- **Pure codec:** `codec.ts` encodes commands and decodes Indoor Bike Data. The flags field (uint16) says which fields are present, and instantaneous power is at flag bit 6. Tested with byte fixtures.
- **Disconnect handling:** listen for `gattserverdisconnected`, emit status, and let the runner pause. The UI offers a "Reconnect" button (reconnect via `device.gatt.connect()`, no new picker).

### `MockTrainer`

Simulates a trainer: power moves toward the target with some lag and noise, and cadence stays around 90. Used for UI development without the bike and in runner tests. Selectable in the UI ("Use simulated trainer").

## Module 3: `runner/` (workout → trainer commands)

- **States:** `idle → running ⇄ paused → finished` (plus `stopped`).
- **Time:** elapsed time comes from a `Clock` (`now()` in ms), counting only while running. The current step is computed from elapsed time, never by counting ticks, so throttled timers (background tab) don't cause drift.
- **Tick** every 250 ms:
  1. `t = elapsed`, `segment = segmentAt(t)`
  2. `target = round(powerAt(t) × FTP)`. On ramps, round to the nearest 5 W so the target isn't resent every tick.
  3. If the target changed and the last send was ≥ 1 s ago, call `trainer.setTargetPower(target)`.
  4. `free` segment: call `releaseControl()` once on entry and request control again on exit.
  5. Emit a `RunnerSnapshot` to subscribers.
- **Pause:** stop the clock and set a low target (e.g. 50% FTP) so the trainer doesn't lock up when you stop pedalling. **Resume:** send the current target again.
- **Finish:** release control (no more target watts).
- **Trainer disconnect:** pause automatically.

```ts
interface RunnerSnapshot {
  state: RunnerState
  elapsed: number; remaining: number
  segmentIndex: number; segmentElapsed: number; segmentRemaining: number
  targetPower?: number          // undefined during free segments
  nextSegment?: Segment
  activeTextEvent?: TextEvent
  live: TrainerData             // last reading from the trainer
}
```

### Tests

Fake clock + `MockTrainer` spy: targets sent at segment boundaries, ramp throttling, pause/resume elapsed time, free segment release, finish, disconnect → auto-pause.

## UI (React, mobile-friendly)

- **Header:** trainer status and Pair / Disconnect button, plus the simulated-trainer toggle.
- **Library:** import `.zwo` (file picker + drag-and-drop), list saved workouts (name, duration, estimated TSS later).
- **Workout detail:** power profile chart (SVG bars coloured by zone), list of steps, Start button (disabled until a trainer is paired).
- **Ride screen:** large target watts, current watts, cadence, step countdown, total time left, next step preview, progress on the profile chart, current text event. Pause / Resume / Stop. Keeps the screen on with the Screen Wake Lock API.
- **Settings:** FTP (required before the first ride), stored in `localStorage`.
- **Layout:** single-column CSS that works from 360 px wide to desktop, with large touch targets.
- **Unsupported browser:** if `navigator.bluetooth` is missing, show a clear message ("Use Chrome or Edge").

## Container

- `Dockerfile` (dev): `node:22-alpine`, `npm ci`, `npm run dev -- --host 0.0.0.0`.
- `docker-compose.yml`: maps port `5173:5173` and mounts `src/` for hot reload.
- Bluetooth is handled by the **host browser**, not the container. Open `http://localhost:5173` in Chrome on the host.
- Later: a multi-stage `Dockerfile` that runs `vite build` and serves `dist/` with nginx.

## Iterations

| # | Deliverable | Done when |
|---|---|---|
| 0 | Scaffold: Vite + React + TS strict, Vitest, ESLint/Prettier, Dockerfile, compose | `docker compose up` serves the app on localhost; `npm test` passes |
| 1 | `workout/`: model + `.zwo` parser + tests | All fixtures parse into the expected segments |
| 2 | `trainer/`: interface, `MockTrainer`, FTMS codec + tests | Codec round-trip tests pass |
| 3 | `runner/` + tests | Fake-clock tests cover every state transition |
| 4 | UI with `MockTrainer`: library, detail, ride, settings | A full workout runs end to end in the browser with the simulated trainer |
| 5 | `FtmsTrainer` against the real KICKR Core | Pair, ERG follows targets for steady, interval and ramp steps; pause/resume/stop work; reconnect after a dropout |
| 6 | Polish: wake lock, unsupported-browser message, error states, README | Manual test checklist passes |

### Manual test checklist (real trainer)

- [ ] Update the KICKR Core firmware through the Wahoo app; close Zwift / the Wahoo app before pairing
- [ ] macOS: Chrome allowed under System Settings → Privacy & Security → Bluetooth
- [ ] Pair from the app; status shows "controlling"
- [ ] Steady step: power settles near the target within ~5 s
- [ ] Step change: the new target applies at the boundary
- [ ] Ramp: resistance rises smoothly
- [ ] FreeRide: resistance released
- [ ] Pause / resume; stop releases control
- [ ] Switch the trainer off mid-ride → runner pauses → reconnect → resume

## Risks

| Risk | Mitigation |
|---|---|
| Firmware doesn't advertise FTMS | Update firmware. Fallback: Wahoo's proprietary control characteristic (`A026E005-…`), out of scope unless needed |
| Another app holds control | Show an error when Request Control fails ("close Zwift / the Wahoo app") |
| Timers throttled in background tabs | Time-based runner + wake lock; the README says to keep the tab in front |
| Web Bluetooth only in Chrome / Edge | Detect it and show a message; mobile support comes later |
| ERG lag on short intervals (< 30 s) | Acceptable in v1; could send the next target ~1–2 s early later |

## Token estimate (Claude Code)

This is an estimate for implementing the plan with Claude Code, one session per iteration. Input tokens dominate because the conversation context is re-read on each turn, though most of it hits the prompt cache.

| Iteration | Input tokens (mostly cached) | Output tokens | Notes |
|---|---|---|---|
| 0 Scaffold | 60–100k | 8–12k | Config files, Docker |
| 1 Parser + tests | 120–200k | 15–25k | Fixtures take most of the output |
| 2 Trainer interface, mock, codec | 120–200k | 12–20k | |
| 3 Runner + tests | 150–250k | 15–25k | The trickiest logic |
| 4 UI with mock | 250–400k | 30–45k | Most of the files; a few rounds of UI tweaks |
| 5 FTMS on real device | 200–400k | 10–20k | Depends on debugging rounds, which need you on the bike to report results |
| 6 Polish + README | 80–150k | 8–15k | |
| **Total** | **~1.0–1.7M** | **~100–160k** | |

- A clean run through the plan lands near the low end. Real-device debugging (iteration 5) and design changes are what push it to the high end.
- Using sub-agents (e.g. one per module in parallel) adds about 20–40% in total tokens but reduces the time it takes.
