import type { ScaffoldError, ScaffoldWarning } from '../../types/index.js'
import type { OutputMode } from '../../types/index.js'
import { InteractiveOutput } from './interactive.js'
import { JsonOutput } from './json.js'
import { AutoOutput } from './auto.js'

export type SelectOption = string | {
  value: string
  label?: string
  short?: string
}

export interface OutputContext {
  // Status messages
  success(message: string): void
  info(message: string): void
  warn(warning: ScaffoldWarning | string): void
  error(error: ScaffoldError | string): void

  // Structured output (for commands that return data)
  result(data: unknown): void

  // Capability queries
  supportsInteractivePrompts(): boolean

  // User prompts
  prompt<T>(message: string, defaultValue: T, help?: { short?: string }): Promise<T>
  confirm(message: string, defaultValue?: boolean, help?: { short?: string }): Promise<boolean>

  /** Single-choice selection from a list of options. */
  select(message: string, options: SelectOption[], defaultValue?: string, help?: { short?: string; long?: string }): Promise<string>

  /** Multi-choice selection from a list of options. Returns selected items. */
  multiSelect(message: string, options: SelectOption[], defaults?: string[], help?: { short?: string; long?: string }): Promise<string[]>

  /** Comma-separated text input returning an array of trimmed strings. */
  multiInput(message: string, defaultValue?: string[], help?: { short?: string }): Promise<string[]>

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
