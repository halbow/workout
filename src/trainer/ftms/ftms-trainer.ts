import { Emitter } from '../emitter'
import type { Trainer, TrainerEvent, TrainerStatus } from '../types'
import {
  decodeFeatures,
  decodeIndoorBikeData,
  decodeMachineStatus,
  describeResult,
  encodeRequestControl,
  encodeReset,
  encodeSetTargetPower,
  encodeStartOrResume,
  MachineStatus,
  ResultCode,
  type Command,
} from './codec'
import { ControlPointQueue } from './control-point-queue'
import {
  FITNESS_MACHINE_CONTROL_POINT,
  FITNESS_MACHINE_FEATURE,
  FITNESS_MACHINE_STATUS,
  FTMS_SERVICE,
  INDOOR_BIKE_DATA,
} from './uuids'

/** Minimum time between two Set Target Power writes. */
const POWER_INTERVAL_MS = 1000
const MAX_WATTS = 2000

export function isWebBluetoothAvailable(): boolean {
  return typeof navigator !== 'undefined' && 'bluetooth' in navigator
}

/** Controls a smart trainer through the Bluetooth Fitness Machine Service (e.g. Wahoo KICKR Core). */
export class FtmsTrainer implements Trainer {
  status: TrainerStatus = 'disconnected'

  private readonly emitter = new Emitter<TrainerEvent>()
  private device?: BluetoothDevice
  private queue?: ControlPointQueue
  private listeners: Array<[BluetoothRemoteGATTCharacteristic, EventListener]> = []
  private manualDisconnect = false

  private lastSentPower?: number
  private lastSentAt = 0
  private pendingPower?: number
  private flushTimer?: ReturnType<typeof setTimeout>

  get name() {
    return this.device?.name
  }

  subscribe(listener: (e: TrainerEvent) => void) {
    return this.emitter.subscribe(listener)
  }

  async connect() {
    if (!isWebBluetoothAvailable()) {
      throw new Error('Web Bluetooth is not available. Use Chrome or Edge.')
    }
    this.setStatus('connecting')
    try {
      const device = await navigator.bluetooth.requestDevice({
        filters: [{ services: [FTMS_SERVICE] }],
      })
      this.device?.removeEventListener('gattserverdisconnected', this.onDisconnected)
      this.device = device
      device.addEventListener('gattserverdisconnected', this.onDisconnected)
      await this.setup()
    } catch (error) {
      this.fail(error)
      throw error
    }
  }

  async reconnect() {
    if (!this.device) return this.connect()
    this.setStatus('connecting')
    try {
      await this.setup()
    } catch (error) {
      this.fail(error)
      throw error
    }
  }

  async disconnect() {
    this.manualDisconnect = true
    this.cancelPendingPower()
    if (this.device?.gatt?.connected && this.status === 'controlling') {
      try {
        await this.queue?.send(encodeReset())
      } catch {
        // Best effort: we are leaving anyway.
      }
    }
    this.teardown()
    this.queue?.close()
    this.queue = undefined
    this.device?.gatt?.disconnect()
    this.setStatus('disconnected')
  }

  async setTargetPower(watts: number) {
    const target = Math.max(0, Math.min(MAX_WATTS, Math.round(watts)))
    if (this.status === 'controlling' && target === this.lastSentPower) {
      this.pendingPower = undefined
      return
    }
    const wait = this.lastSentAt + POWER_INTERVAL_MS - Date.now()
    if (wait > 0) {
      // Coalesce: only the latest value is sent once the interval has passed.
      this.pendingPower = target
      this.flushTimer ??= setTimeout(() => void this.flushPendingPower(), wait)
      return
    }
    await this.sendPower(target)
  }

  async releaseControl() {
    this.cancelPendingPower()
    if (this.status !== 'controlling') return
    await this.command(encodeReset(), 'release control')
    this.lastSentPower = undefined
    this.setStatus('connected')
  }

  private async setup() {
    const server = await this.device!.gatt!.connect()
    const service = await server.getPrimaryService(FTMS_SERVICE)
    this.manualDisconnect = false

    const features = await optionalCharacteristic(service, FITNESS_MACHINE_FEATURE)
    if (features && !decodeFeatures(await features.readValue()).powerTargetSupported) {
      throw new Error('This trainer does not support ERG mode (power target).')
    }

    const controlPoint = await service.getCharacteristic(FITNESS_MACHINE_CONTROL_POINT)
    const queue = new ControlPointQueue((bytes) => controlPoint.writeValueWithResponse(bytes))
    this.queue?.close()
    this.queue = queue
    this.listen(controlPoint, (view) => queue.handleIndication(view))
    await controlPoint.startNotifications()

    const bikeData = await service.getCharacteristic(INDOOR_BIKE_DATA)
    this.listen(bikeData, this.onBikeData)
    await bikeData.startNotifications()

    const machineStatus = await optionalCharacteristic(service, FITNESS_MACHINE_STATUS)
    if (machineStatus) {
      this.listen(machineStatus, this.onMachineStatus)
      await machineStatus.startNotifications()
    }

    this.setStatus('connected')
    await this.takeControl()
  }

  private async takeControl() {
    const result = await this.queue!.send(encodeRequestControl())
    if (result !== ResultCode.Success) {
      throw new Error(
        `The trainer refused control (${describeResult(result)}). Close Zwift or the Wahoo app and try again.`,
      )
    }
    // Some trainers reject Start when already started: not fatal.
    await this.queue!.send(encodeStartOrResume())
    this.setStatus('controlling')
  }

  private async sendPower(watts: number) {
    this.lastSentAt = Date.now()
    try {
      if (this.status === 'connected') await this.takeControl()
      await this.command(encodeSetTargetPower(watts), 'set target power')
      this.lastSentPower = watts
    } catch (error) {
      this.emitter.emit({ type: 'error', message: errorMessage(error) })
    }
  }

  private async flushPendingPower() {
    this.flushTimer = undefined
    const watts = this.pendingPower
    this.pendingPower = undefined
    if (watts !== undefined && this.status !== 'disconnected' && this.status !== 'error') {
      await this.setTargetPower(watts)
    }
  }

  private cancelPendingPower() {
    clearTimeout(this.flushTimer)
    this.flushTimer = undefined
    this.pendingPower = undefined
  }

  private async command(bytes: Command, what: string) {
    if (!this.queue) throw new Error('The trainer is not connected.')
    const result = await this.queue.send(bytes)
    if (result !== ResultCode.Success) {
      throw new Error(`The trainer could not ${what}: ${describeResult(result)}.`)
    }
  }

  private listen(
    characteristic: BluetoothRemoteGATTCharacteristic,
    handler: (view: DataView) => void,
  ) {
    const listener = (event: Event) => {
      const value = (event.target as BluetoothRemoteGATTCharacteristic).value
      if (value) handler(value)
    }
    characteristic.addEventListener('characteristicvaluechanged', listener)
    this.listeners.push([characteristic, listener])
  }

  private teardown() {
    this.cancelPendingPower()
    for (const [characteristic, listener] of this.listeners) {
      characteristic.removeEventListener('characteristicvaluechanged', listener)
    }
    this.listeners = []
    this.lastSentPower = undefined
  }

  private onBikeData = (view: DataView) => {
    try {
      this.emitter.emit({
        type: 'data',
        data: { ...decodeIndoorBikeData(view), timestamp: Date.now() },
      })
    } catch {
      // Ignore truncated packets.
    }
  }

  private onMachineStatus = (view: DataView) => {
    if (
      decodeMachineStatus(view) === MachineStatus.ControlPermissionLost &&
      this.status === 'controlling'
    ) {
      this.lastSentPower = undefined
      this.setStatus('connected')
    }
  }

  private onDisconnected = () => {
    this.queue?.close()
    this.queue = undefined
    this.teardown()
    if (!this.manualDisconnect) this.setStatus('disconnected', 'The trainer disconnected.')
  }

  private fail(error: unknown) {
    this.teardown()
    if (this.device?.gatt?.connected) this.device.gatt.disconnect()
    const message = errorMessage(error)
    // The user closing the device picker is not an error.
    if (error instanceof DOMException && error.name === 'NotFoundError') {
      this.setStatus('disconnected')
    } else {
      this.setStatus('error', message)
    }
  }

  private setStatus(status: TrainerStatus, error?: string) {
    this.status = status
    this.emitter.emit({ type: 'status', status, error })
  }
}

async function optionalCharacteristic(service: BluetoothRemoteGATTService, uuid: number) {
  try {
    return await service.getCharacteristic(uuid)
  } catch {
    return undefined
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
