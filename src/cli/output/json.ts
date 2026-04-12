import type { ScaffoldError, ScaffoldWarning } from '../../types/index.js'
import type { OutputContext, SelectOption } from './context.js'

function isScaffoldError(e: ScaffoldError | string): e is ScaffoldError {
  return typeof e === 'object' && e !== null && 'code' in e && 'message' in e
}

function isScaffoldWarning(w: ScaffoldWarning | string): w is ScaffoldWarning {
  return typeof w === 'object' && w !== null && 'code' in w && 'message' in w
}

export class JsonOutput implements OutputContext {
  private bufferedWarnings: ScaffoldWarning[] = []

  success(message: string): void {
    process.stderr.write(`✓ ${message}\n`)
  }

  info(message: string): void {
    process.stderr.write(`→ ${message}\n`)
  }

  warn(warning: ScaffoldWarning | string): void {
    const msg = isScaffoldWarning(warning) ? warning.message : warning
    if (isScaffoldWarning(warning)) {
      this.bufferedWarnings.push(warning)
    } else {
      this.bufferedWarnings.push({ code: 'WARN', message: msg })
    }
    process.stderr.write(`⚠ ${msg}\n`)
  }

  error(error: ScaffoldError | string): void {
    if (isScaffoldError(error)) {
      process.stderr.write(`✗ ${error.code}: ${error.message}\n`)
      if (error.recovery) {
        process.stderr.write(`  Recovery: ${error.recovery}\n`)
      }
    } else {
      process.stderr.write(`✗ ${error}\n`)
    }
  }

  result(data: unknown): void {
    process.stdout.write(JSON.stringify({
      success: true,
      data,
      errors: [],
      warnings: this.bufferedWarnings,
      exit_code: 0,
    }) + '\n')
  }

  supportsInteractivePrompts(): boolean {
    return false
  }

  async prompt<T>(message: string, defaultValue: T, _help?: { short?: string }): Promise<T> {
    process.stderr.write(`Using default: ${String(defaultValue)}\n`)
    void message
    return defaultValue
  }

  async confirm(message: string, defaultValue = false, _help?: { short?: string }): Promise<boolean> {
    void message
    return defaultValue
  }

  async select(
    _msg: string,
    options: SelectOption[],
    defaultValue?: string,
    _help?: { short?: string; long?: string },
  ): Promise<string> {
    const first = typeof options[0] === 'string' ? options[0] : options[0]?.value
    return defaultValue ?? first ?? ''
  }

  async multiSelect(
    _msg: string,
    _options: SelectOption[],
    defaults?: string[],
    _help?: { short?: string; long?: string },
  ): Promise<string[]> {
    return defaults ?? []
  }

  async multiInput(_msg: string, defaultValue?: string[], _help?: { short?: string }): Promise<string[]> {
    return defaultValue ?? []
  }

  startSpinner(message: string): void {
    void message
    // no-op
  }

  stopSpinner(success?: boolean): void {
    void success
    // no-op
  }

  startProgress(total: number, label: string): void {
    void total
    void label
    // no-op
  }

  updateProgress(current: number): void {
    void current
    // no-op
  }

  stopProgress(): void {
    // no-op
  }
}
