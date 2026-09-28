import { log as logger, toHex } from '../../logging'
import {
  decodeFeatureList,
  decodeSupportedRange,
  type FeatureList,
  type SupportedRange,
} from './codec'
import {
  FITNESS_MACHINE_FEATURE,
  FTMS_SERVICE,
  SUPPORTED_POWER_RANGE,
  SUPPORTED_RESISTANCE_LEVEL_RANGE,
} from './uuids'

const log = logger.scope('ble-debug')

const DEVICE_INFORMATION = 0x180a
const BATTERY = 0x180f
const BATTERY_LEVEL = 0x2a19

/** Web Bluetooth only exposes the services listed when picking the device. */
const SERVICE_NAMES: Record<number, string> = {
  [FTMS_SERVICE]: 'Fitness Machine (FTMS)',
  0x1818: 'Cycling Power',
  0x1816: 'Cycling Speed and Cadence',
  0x180d: 'Heart Rate',
  [BATTERY]: 'Battery',
  [DEVICE_INFORMATION]: 'Device Information',
}

const CHARACTERISTIC_NAMES: Record<number, string> = {
  0x2acc: 'Fitness Machine Feature',
  0x2ad2: 'Indoor Bike Data',
  0x2ad3: 'Training Status',
  0x2ad6: 'Supported Resistance Level Range',
  0x2ad8: 'Supported Power Range',
  0x2ad9: 'Fitness Machine Control Point',
  0x2ada: 'Fitness Machine Status',
  0x2a63: 'Cycling Power Measurement',
  0x2a65: 'Cycling Power Feature',
  0x2a66: 'Cycling Power Control Point',
  0x2a5b: 'CSC Measurement',
  0x2a5c: 'CSC Feature',
  0x2a5d: 'Sensor Location',
  0x2a37: 'Heart Rate Measurement',
  [BATTERY_LEVEL]: 'Battery Level',
  0x2a29: 'Manufacturer Name',
  0x2a24: 'Model Number',
  0x2a27: 'Hardware Revision',
  0x2a26: 'Firmware Revision',
  0x2a28: 'Software Revision',
}

/** Device Information strings worth reading. The serial number is blocklisted by Chrome. */
const DEVICE_INFO_FIELDS = [0x2a29, 0x2a24, 0x2a27, 0x2a26, 0x2a28]

export interface CharacteristicReport {
  uuid: string
  name?: string
  /** `read`, `write`, `notify`… */
  properties: string[]
}

export interface ServiceReport {
  uuid: string
  name?: string
  characteristics: CharacteristicReport[]
}

export interface DeviceReport {
  id: string
  name?: string
  /** Manufacturer, model, firmware… */
  info: Array<{ label: string; value: string }>
  batteryLevel?: number
  services: ServiceReport[]
  /** Missing when the device has no FTMS feature characteristic. */
  features?: FeatureList & { hex: string }
  powerRange?: SupportedRange
  resistanceRange?: SupportedRange
}

/**
 * Picks a device and reads everything we can about it: services, characteristics, FTMS features
 * and ranges. Read only: no control point writes. Must be called from a user gesture.
 *
 * `allDevices` lists every device in the picker, not only the ones advertising FTMS.
 */
export async function inspectDevice({
  allDevices,
}: {
  allDevices: boolean
}): Promise<DeviceReport> {
  const optionalServices = Object.keys(SERVICE_NAMES).map(Number)
  log.info('requesting device', { allDevices })
  const device = await navigator.bluetooth.requestDevice(
    allDevices
      ? { acceptAllDevices: true, optionalServices }
      : { filters: [{ services: [FTMS_SERVICE] }], optionalServices },
  )
  log.info('device selected', { name: device.name, id: device.id })

  // The trainer may already be paired by the app: the connection is shared, leave it open.
  const wasConnected = device.gatt?.connected ?? false
  const server = await device.gatt!.connect()
  log.info('GATT connected', { alreadyConnected: wasConnected })
  try {
    const report: DeviceReport = { id: device.id, name: device.name, info: [], services: [] }
    for (const service of await server.getPrimaryServices()) {
      report.services.push(await describeService(service))
      const id = shortId(service.uuid)
      if (id === FTMS_SERVICE) await readFtms(service, report)
      else if (id === DEVICE_INFORMATION) await readDeviceInfo(service, report)
      else if (id === BATTERY) {
        const value = await readOptional(service, BATTERY_LEVEL)
        if (value && value.byteLength > 0) report.batteryLevel = value.getUint8(0)
      }
    }
    log.info('inspection done', report)
    return report
  } catch (error) {
    log.error('inspection failed', error)
    throw error
  } finally {
    if (!wasConnected) {
      device.gatt?.disconnect()
      log.info('GATT disconnected')
    }
  }
}

async function describeService(service: BluetoothRemoteGATTService): Promise<ServiceReport> {
  const characteristics = await service.getCharacteristics().catch(() => [])
  return {
    uuid: service.uuid,
    name: nameOf(SERVICE_NAMES, service.uuid),
    characteristics: characteristics.map((c) => ({
      uuid: c.uuid,
      name: nameOf(CHARACTERISTIC_NAMES, c.uuid),
      properties: Object.entries(PROPERTY_LABELS)
        .filter(([key]) => c.properties[key as keyof BluetoothCharacteristicProperties])
        .map(([, label]) => label),
    })),
  }
}

const PROPERTY_LABELS: Record<string, string> = {
  read: 'read',
  write: 'write',
  writeWithoutResponse: 'write without response',
  notify: 'notify',
  indicate: 'indicate',
  broadcast: 'broadcast',
  authenticatedSignedWrites: 'signed writes',
  reliableWrite: 'reliable write',
  writableAuxiliaries: 'writable auxiliaries',
}

async function readFtms(service: BluetoothRemoteGATTService, report: DeviceReport) {
  const features = await readOptional(service, FITNESS_MACHINE_FEATURE)
  if (features) report.features = { ...decodeFeatureList(features), hex: toHex(features) }
  const power = await readOptional(service, SUPPORTED_POWER_RANGE)
  if (power) report.powerRange = decodeSupportedRange(power)
  const resistance = await readOptional(service, SUPPORTED_RESISTANCE_LEVEL_RANGE)
  if (resistance) report.resistanceRange = decodeSupportedRange(resistance, 10)
}

async function readDeviceInfo(service: BluetoothRemoteGATTService, report: DeviceReport) {
  const decoder = new TextDecoder()
  for (const uuid of DEVICE_INFO_FIELDS) {
    const value = await readOptional(service, uuid)
    if (value)
      report.info.push({ label: CHARACTERISTIC_NAMES[uuid]!, value: decoder.decode(value) })
  }
}

/** Reads a characteristic, logging its bytes. Undefined if it is missing or not readable. */
async function readOptional(service: BluetoothRemoteGATTService, uuid: number) {
  try {
    const value = await (await service.getCharacteristic(uuid)).readValue()
    log.info(`← ${CHARACTERISTIC_NAMES[uuid] ?? hexId(uuid)} ${toHex(value)}`)
    return value
  } catch {
    return undefined
  }
}

const BASE_UUID = /^0000([0-9a-f]{4})-0000-1000-8000-00805f9b34fb$/

/** `0x2acc` for a Bluetooth SIG UUID, undefined for a vendor one. */
function shortId(uuid: string): number | undefined {
  const match = BASE_UUID.exec(uuid)
  return match ? parseInt(match[1]!, 16) : undefined
}

function nameOf(names: Record<number, string>, uuid: string): string | undefined {
  const id = shortId(uuid)
  return id === undefined ? undefined : names[id]
}

export function formatUuid(uuid: string): string {
  const id = shortId(uuid)
  return id === undefined ? uuid : hexId(id)
}

function hexId(id: number) {
  return `0x${id.toString(16).padStart(4, '0')}`
}
