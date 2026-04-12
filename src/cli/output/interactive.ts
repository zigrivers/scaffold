import type { ScaffoldError, ScaffoldWarning } from '../../types/index.js'
import type { OutputContext, SelectOption } from './context.js'

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

function dim(s: string): string {
  return isNoColor() || !isTTY() ? s : `\x1b[2m${s}\x1b[0m`
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

  supportsInteractivePrompts(): boolean {
    return canPrompt()
  }

  async prompt<T>(message: string, defaultValue: T, help?: { short?: string }): Promise<T> {
    // Non-interactive: return default immediately
    if (!canPrompt()) {
      return defaultValue
    }
    if (help?.short) {
      process.stdout.write(dim(`  ${help.short}`) + '\n')
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

  async confirm(message: string, defaultValue = false, help?: { short?: string }): Promise<boolean> {
    // Non-interactive: return default immediately
    if (!canPrompt()) {
      return defaultValue
    }
    if (help?.short) {
      process.stdout.write(dim(`  ${help.short}`) + '\n')
    }
    const { confirm } = await import('@inquirer/prompts')
    return confirm({ message, default: defaultValue })
  }

  async select(
    message: string,
    options: SelectOption[],
    defaultValue?: string,
    help?: { short?: string; long?: string },
  ): Promise<string> {
    const normalized = options.map(o => typeof o === 'string' ? { value: o } : o)
    if (!canPrompt()) {
      return defaultValue ?? normalized[0]?.value ?? ''
    }

    const renderFrame = (): void => {
      if (help?.short) {
        process.stdout.write(dim(`  ${help.short}`) + '\n')
      }
      const suffix = help?.long ? ' (? for help)' : ''
      process.stdout.write(`${message}${suffix}\n`)
      for (let i = 0; i < normalized.length; i++) {
        const opt = normalized[i]!
        const displayName = opt.label ?? opt.value
        const marker = opt.value === defaultValue ? ' (default)' : ''
        process.stdout.write(`  ${i + 1}. ${displayName}${marker}\n`)
        if (opt.short) {
          process.stdout.write(`     ${dim(opt.short)}\n`)
        }
      }
    }

    renderFrame()
    const { input } = await import('@inquirer/prompts')
    // Loop until valid input
    for (;;) {
      const answer = await input({
        message: 'Enter number or text:',
        default: defaultValue,
      })
      const trimmed = answer.trim()
      // Handle ? help request
      if (trimmed === '?') {
        if (help?.long) {
          process.stdout.write(dim(help.long) + '\n')
          renderFrame()
        } else {
          const vals = normalized.map(n => n.value).join(', ')
          process.stdout.write(`  No additional help available — pick one of: ${vals}\n`)
        }
        continue
      }
      // Accept number input (strict: entire string must be a valid integer)
      if (/^\d+$/.test(trimmed)) {
        const num = Number(trimmed)
        if (num >= 1 && num <= normalized.length) {
          return normalized[num - 1]?.value ?? defaultValue ?? normalized[0]?.value ?? ''
        }
      }
      // Accept exact text match (trimmed)
      if (normalized.some(n => n.value === trimmed)) {
        return trimmed
      }
      // Accept label text match (case-insensitive)
      const labelMatch = normalized.find(
        n => n.label && n.label.toLowerCase() === trimmed.toLowerCase(),
      )
      if (labelMatch) {
        return labelMatch.value
      }
      // Invalid input — print error and re-prompt (do not re-print options)
      const opts = normalized.map(n => n.value).join(', ')
      process.stdout.write(
        `  Invalid input "${trimmed}". Enter a number (1-${normalized.length}) or one of: ${opts}\n`,
      )
    }
  }

  async multiSelect(
    message: string,
    options: SelectOption[],
    defaults?: string[],
    help?: { short?: string; long?: string },
  ): Promise<string[]> {
    const normalized = options.map(o => typeof o === 'string' ? { value: o } : o)
    if (!canPrompt()) {
      return defaults ?? []
    }

    const renderFrame = (): void => {
      if (help?.short) {
        process.stdout.write(dim(`  ${help.short}`) + '\n')
      }
      const suffix = help?.long ? ' (? for help)' : ''
      process.stdout.write(`${message}${suffix}\n`)
      for (let i = 0; i < normalized.length; i++) {
        const opt = normalized[i]!
        const displayName = opt.label ?? opt.value
        const isDefault = defaults?.includes(opt.value) ? ' *' : ''
        process.stdout.write(`  ${i + 1}. ${displayName}${isDefault}\n`)
        if (opt.short) {
          process.stdout.write(`     ${dim(opt.short)}\n`)
        }
      }
    }

    renderFrame()
    const { input } = await import('@inquirer/prompts')
    // Loop until valid input
    for (;;) {
      const answer = await input({
        message: 'Enter numbers or text (comma-separated):',
        default: defaults?.join(', '),
      })
      const trimmed = answer.trim()
      // Handle ? help request (only when entire input is ?)
      if (trimmed === '?') {
        if (help?.long) {
          process.stdout.write(dim(help.long) + '\n')
          renderFrame()
        } else {
          const vals = normalized.map(n => n.value).join(', ')
          process.stdout.write(`  No additional help available — pick from: ${vals}\n`)
        }
        continue
      }
      const parts = answer.split(',').map(s => s.trim()).filter(Boolean)
      // Empty input (user pressed Enter) — return defaults
      if (parts.length === 0) {
        return defaults ?? []
      }
      const selected: string[] = []
      for (const part of parts) {
        if (/^\d+$/.test(part)) {
          const num = Number(part)
          if (num >= 1 && num <= normalized.length) {
            const opt = normalized[num - 1]?.value
            if (opt !== undefined && !selected.includes(opt)) {
              selected.push(opt)
            }
          }
        } else if (normalized.some(n => n.value === part) && !selected.includes(part)) {
          selected.push(part)
        } else {
          // Accept label text match (case-insensitive)
          const labelMatch = normalized.find(
            n => n.label && n.label.toLowerCase() === part.toLowerCase(),
          )
          if (labelMatch && !selected.includes(labelMatch.value)) {
            selected.push(labelMatch.value)
          }
        }
      }
      if (selected.length > 0) {
        // Warn about any unrecognized entries
        const inputParts = answer.split(',').map(s => s.trim()).filter(Boolean)
        const unrecognized = inputParts.filter(part => {
          if (/^\d+$/.test(part)) {
            const num = Number(part)
            return num < 1 || num > normalized.length
          }
          return !normalized.some(n => n.value === part) &&
                 !normalized.some(n => n.label?.toLowerCase() === part.toLowerCase())
        })
        if (unrecognized.length > 0) {
          process.stdout.write(`  Ignored unrecognized: ${unrecognized.join(', ')}\n`)
        }
        return selected
      }
      // Non-empty input but no valid selections — print error and re-prompt
      const opts = normalized.map(n => n.value).join(', ')
      process.stdout.write(
        `  Invalid input. Enter numbers (1-${normalized.length}) or values from: ${opts}\n`,
      )
    }
  }

  async multiInput(message: string, defaultValue?: string[], help?: { short?: string }): Promise<string[]> {
    if (!canPrompt()) {
      return defaultValue ?? []
    }
    if (help?.short) {
      process.stdout.write(dim(`  ${help.short}`) + '\n')
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
