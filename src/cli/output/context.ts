import type { ScaffoldError, ScaffoldWarning } from '../../types/index.js'
import type { OutputMode } from '../../types/index.js'
import { InteractiveOutput } from './interactive.js'
import { JsonOutput } from './json.js'
import { AutoOutput } from './auto.js'

export interface OutputContext {
  // Status messages
  success(message: string): void
  info(message: string): void
  warn(warning: ScaffoldWarning | string): void
  error(error: ScaffoldError | string): void

  // Structured output (for commands that return data)
  result(data: unknown): void

  // User prompts
  prompt<T>(message: string, defaultValue: T): Promise<T>
  confirm(message: string, defaultValue?: boolean): Promise<boolean>

  // Progress indicators
  startSpinner(message: string): void
  stopSpinner(success?: boolean): void
  startProgress(total: number, label: string): void
  updateProgress(current: number): void
  stopProgress(): void
}

export { type OutputMode }

export function createOutputContext(mode: OutputMode): OutputContext {
  switch (mode) {
  case 'json':
    return new JsonOutput()
  case 'auto':
    return new AutoOutput()
  case 'interactive':
  default:
    return new InteractiveOutput()
  }
}
