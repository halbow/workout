# Record & replay trainer sessions

As a developer, I can record a real ride (every BLE read, write and notification with its timestamp),
then replay it without the bike to debug an issue or run it as an integration test.

Not a logger: logs are for humans (filtered by level, formatted text). A recording must be lossless
and machine-readable, so it is captured at the BLE boundary.

## Step 1: transport refactor (no behaviour change)

Move the Web Bluetooth calls out of `FtmsTrainer` behind an interface:

```ts
interface FtmsTransport {
  read(char: Uuid): Promise<DataView | undefined>
  write(char: Uuid, bytes: Uint8Array): Promise<void>
  subscribe(char: Uuid, onValue: (v: DataView) => void): Promise<void>
}
```

- `WebBluetoothTransport`: current code.
- `FtmsTrainer` only talks to the transport; codec, control point queue and state machine unchanged.

## Step 2: recording

- `RecordingTransport` wraps the real transport and appends every event to the recording.
- Toggle in the BLE debug panel (off by default, ~300 KB per hour of riding).
- Download button, like the log download.

Format: JSON Lines, a header then one line per event (`t` = ms since start):

```
{"v":1,"device":"KICKR CORE 08F1","workout":{...},"ftp":200,"startedAt":1790610228190}
{"t":2337,"op":"read","char":"2acc","hex":"03 40 00 00 0c 60 00 00"}
{"t":2640,"op":"write","char":"2ad9","hex":"00"}
{"t":2699,"op":"notify","char":"2ad9","hex":"80 00 01"}
{"t":2792,"op":"notify","char":"2ad2","hex":"44 00 00 00 00 00 00 00"}
```

The header holds the workout and FTP so a replay can run the same ride.

## Step 3: replay

- `ReplayTransport` plays notifications at their recorded time, on the runner's fake clock.
- On a write, it checks it against the next recorded write and emits the recorded response.
  A mismatch is reported (expected vs actual, with the time).
- Integration tests: replay recordings stored in the repo (e.g. `src/trainer/ftms/__tests__/recordings/`)
  through `WorkoutRunner` + `FtmsTrainer`, assert the same commands are sent, with a timing tolerance
  (a few hundred ms) rather than exact equality.

## Limits

A replay is not interactive: if the control logic changes and sends different commands, the recorded
trainer responses no longer match. Good for regressions, decoding real packets, disconnect/refusal
scenarios and offline debugging. Not for testing new ERG logic; that needs a mock trainer that models
the power response.
