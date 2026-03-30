import type { ScaffoldError, ScaffoldWarning } from '../../types/index.js'
import type { OutputContext } from './context.js'

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']

function isNoColor(): boolean {
  return !!process.env['NO_COLOR']
}

function isTTY(): boolean {
  return process.stdout.isTTY === true
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
    // Non-TTY or NO_COLOR: return default immediately
    if (!isTTY() || isNoColor()) {
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
    // Non-TTY or NO_COLOR: return default immediately
    if (!isTTY() || isNoColor()) {
      return defaultValue
    }
    const { confirm } = await import('@inquirer/prompts')
    return confirm({ message, default: defaultValue })
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
