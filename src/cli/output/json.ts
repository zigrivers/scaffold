import type { ScaffoldError, ScaffoldWarning } from '../../types/index.js'
import type { OutputContext } from './context.js'

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

  async prompt<T>(message: string, defaultValue: T): Promise<T> {
    process.stderr.write(`Using default: ${String(defaultValue)}\n`)
    void message
    return defaultValue
  }

  async confirm(message: string, defaultValue = false): Promise<boolean> {
    void message
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
