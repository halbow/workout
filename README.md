# ERG Workout Player

Runs Zwift workouts (`.zwo`) on a smart trainer in ERG mode, from the browser. Pairs with a Wahoo KICKR Core (or any trainer that supports Bluetooth FTMS) over Web Bluetooth. No backend. See [PLAN.md](PLAN.md) for the design.

## Run it

With Docker:

```sh
docker compose up --build
```

Without Docker (Node 22+):

```sh
npm install
npm run dev
```

Then open **http://localhost:5173 in Chrome or Edge on the host**. Bluetooth is handled by the host browser, not the container. `localhost` counts as a secure context, which Web Bluetooth requires.

## Use it

1. Set your FTP (asked on first launch, or ⚙︎).
2. Import `.zwo` files (click or drag and drop), or add the sample workout.
3. Click **Pair trainer** and pick the KICKR in the Chrome device picker. The status should show **Controlling**.
   No trainer at hand? Tick **Use simulated trainer**.
4. Open a workout and click **Start workout**, then **Start**.

Keep the tab in front during a ride: browsers throttle background tabs. The runner computes the current step from elapsed time so it doesn't drift, but targets are sent less often. The screen is kept on with the Wake Lock API.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server on port 5173 |
| `npm test` | Unit tests (Vitest) |
| `npm run typecheck` | TypeScript, strict |
| `npm run lint` | ESLint |
| `npm run build` | Type-check and production build to `dist/` |

## Layout

```
src/
├── workout/   .zwo parser and time helpers (pure)
├── trainer/   Trainer interface, MockTrainer, FTMS codec + Web Bluetooth implementation
├── runner/    Workout state machine and tick loop (pure, fake-clock tested)
├── storage/   localStorage settings, IndexedDB workouts
└── ui/        React screens and components
```

`workout/`, `trainer/` and `runner/` don't import React (enforced by ESLint).

## Troubleshooting

- **The KICKR doesn't show in the picker:** close Zwift and the Wahoo app (on every device), update the firmware through the Wahoo app, and on macOS allow Chrome under System Settings → Privacy & Security → Bluetooth.
- **"The trainer refused control":** another app is connected to the trainer. Close it and pair again.
- **"This browser does not support Web Bluetooth":** use Chrome or Edge on desktop. Safari and Firefox don't support it.
- **The trainer drops out mid-ride:** the workout pauses. Click **Reconnect** (no new picker), then **Resume**.

## Manual test checklist (real trainer)

- [ ] Update the KICKR Core firmware through the Wahoo app; close Zwift / the Wahoo app before pairing
- [ ] macOS: Chrome allowed under System Settings → Privacy & Security → Bluetooth
- [ ] Pair from the app; status shows "Controlling"
- [ ] Steady step: power settles near the target within ~5 s
- [ ] Step change: the new target applies at the boundary
- [ ] Ramp: resistance rises smoothly
- [ ] FreeRide: resistance released
- [ ] Pause / resume; stop releases control
- [ ] Switch the trainer off mid-ride → runner pauses → reconnect → resume
