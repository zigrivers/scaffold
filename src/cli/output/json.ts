import type { ScaffoldError, ScaffoldWarning } from '../../types/index.js'
import { ExitCode } from '../../types/enums.js'
import type { TerminalError } from '../../types/errors.js'
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

  fail(errors: TerminalError[], exitCode?: ExitCode): void {
    const resolved = exitCode ?? errors[0]?.exitCode ?? ExitCode.ValidationError
    // A failure envelope with an empty errors array tells a caller that
    // something went wrong and nothing about what, which is only marginally
    // better than the empty stdout this replaced. Guarantee at least one
    // actionable entry so `errors[0].code` is always safe to read.
    if (errors.length === 0) {
      errors = [{
        code: 'INTERNAL_ERROR',
        message: 'The command failed without reporting a specific error.',
        exitCode: resolved,
        recovery: 'Re-run with --verbose for detail; if it persists, this is a bug worth reporting',
      }]
    }
    // Human-readable half on stderr, matching error(), so a person piping
    // stdout to jq still sees what went wrong.
    for (const e of errors) {
      process.stderr.write(`✗ ${e.code}: ${e.message}\n`)
      if (e.recovery) {
        process.stderr.write(`  Recovery: ${e.recovery}\n`)
      }
    }
    process.stdout.write(JSON.stringify({
      success: false,
      data: null,
      errors,
      warnings: this.bufferedWarnings,
      exit_code: resolved,
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
