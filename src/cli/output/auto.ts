import type { ScaffoldError, ScaffoldWarning } from '../../types/index.js'
import type { OutputContext } from './context.js'
import { InteractiveOutput } from './interactive.js'

export class AutoOutput implements OutputContext {
  private interactive = new InteractiveOutput()

  success(message: string): void {
    this.interactive.success(message)
  }

  info(message: string): void {
    this.interactive.info(message)
  }

  warn(warning: ScaffoldWarning | string): void {
    this.interactive.warn(warning)
  }

  error(error: ScaffoldError | string): void {
    this.interactive.error(error)
  }

  result(data: unknown): void {
    this.interactive.result(data)
  }

  async prompt<T>(message: string, defaultValue: T): Promise<T> {
    process.stderr.write(`(auto) Using default for: ${message}\n`)
    return defaultValue
  }

  async confirm(message: string, defaultValue = false): Promise<boolean> {
    process.stderr.write(`(auto) Confirming: ${message}\n`)
    return defaultValue
  }

  async select(_msg: string, options: string[], defaultValue?: string): Promise<string> {
    return defaultValue ?? options[0] ?? ''
  }

  async multiSelect(_msg: string, _options: string[], defaults?: string[]): Promise<string[]> {
    return defaults ?? []
  }

  async multiInput(_msg: string, defaultValue?: string[]): Promise<string[]> {
    return defaultValue ?? []
  }

  startSpinner(message: string): void {
    this.interactive.startSpinner(message)
  }

  stopSpinner(success?: boolean): void {
    this.interactive.stopSpinner(success)
  }

  startProgress(total: number, label: string): void {
    this.interactive.startProgress(total, label)
  }

  updateProgress(current: number): void {
    this.interactive.updateProgress(current)
  }

  stopProgress(): void {
    this.interactive.stopProgress()
  }
}
