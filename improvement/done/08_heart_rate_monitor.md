# Heart rate monitor

As a user, I can pair a heart rate strap (Garmin HRM 600) next to my trainer, and see my heart rate
during the ride.

Today heart rate only comes from the trainer's FTMS Indoor Bike Data (`codec.ts`, flag bit 9). The
Kickr Core doesn't send it, so the "Heart rate" tile on the Ride screen never shows.

## Pairing the HRM 600

- New device, separate from the trainer: it only reads, it has no control.
- Uses the standard BLE Heart Rate Service (`0x180D`), so any strap that follows the spec works,
  not only the HRM 600.
- Web Bluetooth: `requestDevice({ filters: [{ services: ['heart_rate'] }] })`, then subscribe to
  `heart_rate_measurement` (`0x2A37`).
- Decoding `0x2A37`: flags byte, bit 0 = 0 → HR is `uint8` at offset 1, bit 0 = 1 → `uint16` LE.
  RR intervals are ignored for now.
- Connect / reconnect / disconnect like the trainer (reconnect without the picker), with its own
  status shown in the UI.
- Pairing is optional: a ride works with no strap.

## Heart rate is multi-source

Heart rate can come from several devices: trainer (FTMS), strap (HRM 600), maybe others later
(watch, another sensor).

- Each source emits its readings with a timestamp.
- One place picks the value shown in `live.heartRate`, by priority: dedicated HR sensor > trainer.
- A source is dropped if its last reading is too old (e.g. > 5 s), so we fall back to the next one
  when the strap disconnects or stops sending.
- Adding a source means adding a device, not changing the Ride screen.

## Links

- `05_multi_device_support.md`: the HR monitor is one of the device types in the pairing flow.
