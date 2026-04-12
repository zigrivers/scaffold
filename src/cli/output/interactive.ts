import type { ScaffoldError, ScaffoldWarning } from '../../types/index.js'
import type { OutputContext } from './context.js'

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']

function isNoColor(): boolean {
  return !!process.env['NO_COLOR']
}

function isTTY(): boolean {
  return process.stdout.isTTY === true
}

function canPrompt(): boolean {
  return process.stdin.isTTY === true && process.stdout.isTTY === true
}

function green(s: string): string {
  return isNoColor() || !isTTY() ? s : `\x1b[32m${s}\x1b[0m`
}

function red(s: string): string {
  return isNoColor() || !isTTY() ? s : `\x1b[31m${s}\x1b[0m`
}

function yellow(s: string): string {
  return isNoColor() || !isTTY() ? s : `\x1b[33m${s}\x1b[0m`
}

// cyan is available for future use
// function cyan(s: string): string {
//   return isNoColor() || !isTTY() ? s : `\x1b[36m${s}\x1b[0m`
// }

function isScaffoldError(e: ScaffoldError | string): e is ScaffoldError {
  return typeof e === 'object' && e !== null && 'code' in e && 'message' in e
}

function isScaffoldWarning(w: ScaffoldWarning | string): w is ScaffoldWarning {
  return typeof w === 'object' && w !== null && 'code' in w && 'message' in w
}

export class InteractiveOutput implements OutputContext {
  private spinnerInterval: ReturnType<typeof setInterval> | null = null
  private spinnerFrame = 0
  private progressTotal = 0
  private progressLabel = ''

  success(message: string): void {
    process.stdout.write(green(`✓ ${message}`) + '\n')
  }

  info(message: string): void {
    process.stdout.write(`→ ${message}\n`)
  }

  warn(warning: ScaffoldWarning | string): void {
    const msg = isScaffoldWarning(warning) ? warning.message : warning
    process.stderr.write(yellow(`⚠ ${msg}`) + '\n')
  }

  error(error: ScaffoldError | string): void {
    if (isScaffoldError(error)) {
      process.stderr.write(red(`✗ ${error.code}: ${error.message}`) + '\n')
      if (error.recovery) {
        process.stderr.write(`  Recovery: ${error.recovery}\n`)
      }
    } else {
      process.stderr.write(red(`✗ ${error}`) + '\n')
    }
  }

  result(data: unknown): void {
    process.stdout.write(JSON.stringify(data, null, 2) + '\n')
  }

  async prompt<T>(message: string, defaultValue: T): Promise<T> {
    // Non-interactive: return default immediately
    if (!canPrompt()) {
      return defaultValue
    }
    // In TTY mode, use @inquirer/prompts
    const { input } = await import('@inquirer/prompts')
    const answer = await input({ message, default: String(defaultValue) })
    // Attempt to preserve original type
    if (typeof defaultValue === 'number') {
      return Number(answer) as T
    }
    if (typeof defaultValue === 'boolean') {
      return (answer === 'true') as T
    }
    return answer as T
  }

  async confirm(message: string, defaultValue = false): Promise<boolean> {
    // Non-interactive: return default immediately
    if (!canPrompt()) {
      return defaultValue
    }
    const { confirm } = await import('@inquirer/prompts')
    return confirm({ message, default: defaultValue })
  }

  async select(message: string, options: string[], defaultValue?: string): Promise<string> {
    if (!canPrompt()) {
      return defaultValue ?? options[0] ?? ''
    }
    // Display numbered options
    process.stdout.write(`${message}\n`)
    for (let i = 0; i < options.length; i++) {
      const marker = options[i] === defaultValue ? ' (default)' : ''
      process.stdout.write(`  ${i + 1}. ${options[i]}${marker}\n`)
    }
    const { input } = await import('@inquirer/prompts')
    const answer = await input({
      message: 'Enter number or text:',
      default: defaultValue,
    })
    // Accept number input (strict: entire string must be a valid integer)
    const trimmed = answer.trim()
    if (/^\d+$/.test(trimmed)) {
      const num = Number(trimmed)
      if (num >= 1 && num <= options.length) {
        return options[num - 1] ?? defaultValue ?? options[0] ?? ''
      }
    }
    // Accept exact text match (trimmed)
    if (options.includes(trimmed)) {
      return trimmed
    }
    // Inform user their input was invalid, fall back to default
    const fallback = defaultValue ?? options[0] ?? ''
    process.stdout.write(`  Invalid input "${trimmed}", using default: ${fallback}\n`)
    return fallback
  }

  async multiSelect(message: string, options: string[], defaults?: string[]): Promise<string[]> {
    if (!canPrompt()) {
      return defaults ?? []
    }
    // Display options with defaults marked
    process.stdout.write(`${message}\n`)
    for (let i = 0; i < options.length; i++) {
      const isDefault = defaults?.includes(options[i] ?? '') ? ' *' : ''
      process.stdout.write(`  ${i + 1}. ${options[i]}${isDefault}\n`)
    }
    const { input } = await import('@inquirer/prompts')
    const answer = await input({
      message: 'Enter numbers or text (comma-separated):',
      default: defaults?.join(', '),
    })
    const parts = answer.split(',').map(s => s.trim()).filter(Boolean)
    const selected: string[] = []
    for (const part of parts) {
      if (/^\d+$/.test(part)) {
        const num = Number(part)
        if (num >= 1 && num <= options.length) {
          const opt = options[num - 1]
          if (opt !== undefined && !selected.includes(opt)) {
            selected.push(opt)
          }
        }
      } else if (options.includes(part) && !selected.includes(part)) {
        selected.push(part)
      }
    }
    return selected.length > 0 ? selected : (defaults ?? [])
  }

  async multiInput(message: string, defaultValue?: string[]): Promise<string[]> {
    if (!canPrompt()) {
      return defaultValue ?? []
    }
    const { input } = await import('@inquirer/prompts')
    const answer = await input({
      message,
      default: defaultValue?.join(', '),
    })
    return answer.split(',').map(s => s.trim()).filter(Boolean)
  }

  startSpinner(message: string): void {
    if (!isTTY() || isNoColor()) return
    this.spinnerFrame = 0
    this.spinnerInterval = setInterval(() => {
      const frame = SPINNER_FRAMES[this.spinnerFrame % SPINNER_FRAMES.length] ?? '⠋'
      process.stdout.write(`\r${frame} ${message}`)
      this.spinnerFrame++
    }, 80)
  }

  stopSpinner(success = true): void {
    if (this.spinnerInterval !== null) {
      clearInterval(this.spinnerInterval)
      this.spinnerInterval = null
      // Clear spinner line
      process.stdout.write('\r\x1b[K')
    }
    if (success) {
      // Spinner stopped successfully — caller will call success() if needed
    }
  }

  startProgress(total: number, label: string): void {
    this.progressTotal = total
    this.progressLabel = label
    this.renderProgress(0)
  }

  updateProgress(current: number): void {
    this.renderProgress(current)
  }

  stopProgress(): void {
    process.stdout.write('\n')
    this.progressTotal = 0
    this.progressLabel = ''
  }

  private renderProgress(current: number): void {
    if (!isTTY() || isNoColor()) return
    const BAR_WIDTH = 50
    const ratio = this.progressTotal > 0 ? current / this.progressTotal : 0
    const filled = Math.round(ratio * BAR_WIDTH)
    const empty = BAR_WIDTH - filled
    const bar = '█'.repeat(filled) + '░'.repeat(empty)
    process.stdout.write(`\r[${bar}] ${current}/${this.progressTotal} ${this.progressLabel}`)
  }
}
