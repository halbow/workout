import { decodeControlPointResponse, type Command } from './codec'

interface Pending {
  opCode: number
  resolve: (result: number) => void
  reject: (error: Error) => void
  timer: ReturnType<typeof setTimeout>
}

/**
 * Sends one control point write at a time and waits for its response indication (op code 0x80)
 * before sending the next. Resolves with the FTMS result code.
 */
export class ControlPointQueue {
  private tail: Promise<unknown> = Promise.resolve()
  private pending?: Pending
  private closed = false

  constructor(
    private readonly write: (command: Command) => Promise<void>,
    private readonly timeoutMs = 3000,
  ) {}

  send(command: Command): Promise<number> {
    const run = () => this.run(command)
    const result = this.tail.then(run, run)
    this.tail = result.catch(() => {})
    return result
  }

  /** Feed control point indications here. */
  handleIndication(view: DataView) {
    const response = decodeControlPointResponse(view)
    const pending = this.pending
    if (!response || !pending || response.requestOpCode !== pending.opCode) return
    this.settle()
    pending.resolve(response.result)
  }

  /** Rejects the in-flight command and every later one. */
  close(reason = 'The trainer disconnected.') {
    this.closed = true
    const pending = this.pending
    this.settle()
    pending?.reject(new Error(reason))
  }

  private run(command: Command): Promise<number> {
    if (this.closed) return Promise.reject(new Error('The trainer disconnected.'))
    const opCode = command[0] ?? -1
    return new Promise<number>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.settle()
        reject(new Error(`The trainer did not answer command 0x${opCode.toString(16)}.`))
      }, this.timeoutMs)
      this.pending = { opCode, resolve, reject, timer }
      this.write(command).catch((error: unknown) => {
        if (this.pending?.timer !== timer) return
        this.settle()
        reject(error instanceof Error ? error : new Error(String(error)))
      })
    })
  }

  private settle() {
    if (this.pending) clearTimeout(this.pending.timer)
    this.pending = undefined
  }
}
