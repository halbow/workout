import { log as logger, toHex } from '../logging'
import { isWebBluetoothAvailable } from '../trainer/ftms/ftms-trainer'
import { Emitter } from '../trainer/emitter'
import { decodeHeartRateMeasurement } from './codec'
import type { HeartRateMonitor, HeartRateMonitorEvent, HeartRateMonitorStatus } from './types'
import { HEART_RATE_MEASUREMENT, HEART_RATE_SERVICE } from './uuids'

const log = logger.scope('hrm')

/** Any strap following the Bluetooth Heart Rate Service (e.g. Garmin HRM 600). Read only. */
export class BleHeartRateMonitor implements HeartRateMonitor {
  status: HeartRateMonitorStatus = 'disconnected'

  private readonly emitter = new Emitter<HeartRateMonitorEvent>()
  private device?: BluetoothDevice
  private measurement?: BluetoothRemoteGATTCharacteristic
  private manualDisconnect = false

  get name() {
    return this.device?.name
  }

  subscribe(listener: (e: HeartRateMonitorEvent) => void) {
    return this.emitter.subscribe(listener)
  }

  async connect() {
    if (!isWebBluetoothAvailable()) {
      throw new Error('Web Bluetooth is not available. Use Chrome or Edge.')
    }
    this.setStatus('connecting')
    try {
      log.info('requesting device')
      const device = await navigator.bluetooth.requestDevice({
        filters: [{ services: [HEART_RATE_SERVICE] }],
      })
      log.info('device selected', { name: device.name, id: device.id })
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
    log.info('reconnecting', { name: this.device.name })
    this.setStatus('connecting')
    try {
      await this.setup()
    } catch (error) {
      this.fail(error)
      throw error
    }
  }

  async disconnect() {
    log.info('disconnecting')
    this.manualDisconnect = true
    this.teardown()
    this.device?.gatt?.disconnect()
    this.setStatus('disconnected')
  }

  private async setup() {
    const server = await this.device!.gatt!.connect()
    log.info('GATT connected')
    this.manualDisconnect = false
    const service = await server.getPrimaryService(HEART_RATE_SERVICE)
    const measurement = await service.getCharacteristic(HEART_RATE_MEASUREMENT)
    this.teardown()
    this.measurement = measurement
    measurement.addEventListener('characteristicvaluechanged', this.onMeasurement)
    await measurement.startNotifications()
    this.setStatus('connected')
  }

  private teardown() {
    this.measurement?.removeEventListener('characteristicvaluechanged', this.onMeasurement)
    this.measurement = undefined
  }

  private onMeasurement = (event: Event) => {
    const view = (event.target as BluetoothRemoteGATTCharacteristic).value
    if (!view) return
    try {
      const reading = { bpm: decodeHeartRateMeasurement(view), timestamp: Date.now() }
      log.debug(`← heart rate ${toHex(view)}`, reading)
      this.emitter.emit({ type: 'data', reading })
    } catch {
      // Ignore truncated packets.
      log.debug(`← heart rate ${toHex(view)} (truncated)`)
    }
  }

  private onDisconnected = () => {
    if (this.manualDisconnect) log.info('GATT disconnected')
    else log.error('the heart rate strap disconnected unexpectedly')
    this.teardown()
    if (!this.manualDisconnect) {
      this.setStatus('disconnected', 'The heart rate strap disconnected.')
    }
  }

  private fail(error: unknown) {
    this.teardown()
    if (this.device?.gatt?.connected) this.device.gatt.disconnect()
    const message = error instanceof Error ? error.message : String(error)
    // The user closing the device picker is not an error.
    if (error instanceof DOMException && error.name === 'NotFoundError') {
      log.info('device picker closed')
      this.setStatus('disconnected')
    } else {
      log.error('connection failed', { error: message })
      this.setStatus('error', message)
    }
  }

  private setStatus(status: HeartRateMonitorStatus, error?: string) {
    log.info(`status ${this.status} → ${status}`, error === undefined ? undefined : { error })
    this.status = status
    this.emitter.emit({ type: 'status', status, error })
  }
}
