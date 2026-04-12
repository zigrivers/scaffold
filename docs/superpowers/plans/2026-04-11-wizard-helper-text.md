# Wizard Helper Text Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add inline helper text, per-option descriptions, and `?`-for-long-help to the scaffold init wizard's ~55 interactive prompts. Fix five pre-existing UX bugs surfaced during design review.

**Architecture:** Per-option copy lives in `src/wizard/copy/*.ts` (one file per project type), type-derived from config schemas via a `QuestionCopy<TValue>` conditional type that enforces exhaustive enum coverage at compile time. The `OutputContext` interface gains a richer `SelectOption` type, optional `help?` parameters, and a `supportsInteractivePrompts()` method. `InteractiveOutput.select`/`multiSelect` are rewritten for normalization, hanging-indent rendering, `?` handling, and re-prompt-on-invalid-input.

**Tech Stack:** TypeScript, vitest, `@inquirer/prompts` ^7.4.0, `@inquirer/core` (for `ExitPromptError`), Zod

**Design Spec:** `docs/superpowers/specs/2026-04-11-wizard-helper-text-design.md`

---

## File Map

### Files to Create

| Path | Responsibility |
|------|----------------|
| `src/wizard/copy/types.ts` | `ValueToOptionKey`, `OptionCopy`, `QuestionCopy`, per-config-type copy types, `ProjectCopyMap`, `CoreCopy` |
| `src/wizard/copy/index.ts` | Static imports of all copy modules, `getCopyForType<T>()`, `optionsFromCopy()` helper |
| `src/wizard/copy/core.ts` | Copy for top-level wizard questions (methodology, depth, projectType, adapters, traits, advancedGameGate) |
| `src/wizard/copy/web-app.ts` | Copy for `WebAppConfig` fields |
| `src/wizard/copy/backend.ts` | Copy for `BackendConfig` fields |
| `src/wizard/copy/cli.ts` | Copy for `CliConfig` fields |
| `src/wizard/copy/library.ts` | Copy for `LibraryConfig` fields |
| `src/wizard/copy/mobile-app.ts` | Copy for `MobileAppConfig` fields |
| `src/wizard/copy/data-pipeline.ts` | Copy for `DataPipelineConfig` fields |
| `src/wizard/copy/ml.ts` | Copy for `MlConfig` fields |
| `src/wizard/copy/browser-extension.ts` | Copy for `BrowserExtensionConfig` fields |
| `src/wizard/copy/game.ts` | Copy for `GameConfig` fields |
| `src/wizard/copy/types.test-d.ts` | Type-level tests (vitest `expectTypeOf`) |

### Files to Modify

| Path | What Changes |
|------|-------------|
| `src/cli/output/context.ts` | Add `SelectOption` type, optional `help?` on all 5 prompt methods, `supportsInteractivePrompts()` method |
| `src/cli/output/interactive.ts` | Fix `isTTY()` (check stdin+stdout), drop `isNoColor()` from prompt/confirm early return, rewrite `select`/`multiSelect` (normalization, rich options, `?` handling, re-prompt loop, trim), add `supportsInteractivePrompts()`, dim-hint rendering |
| `src/cli/output/auto.ts` | Update signatures to accept `SelectOption[]` + `help?`, add `supportsInteractivePrompts()` returning `false` |
| `src/cli/output/json.ts` | Same as auto.ts |
| `src/cli/output/context.test.ts` | Add mock for `supportsInteractivePrompts`, update `makeOutputContext()` |
| `src/wizard/questions.ts` | Thread `help` args and `optionsFromCopy()` through every prompt call, add first-prompt banner before `projectType` select |
| `src/wizard/wizard.test.ts` | Update `makeOutputContext()` mock to include `supportsInteractivePrompts` |
| `src/cli/commands/init.ts` | Wrap `runWizard()` call in try-catch for `ExitPromptError` |

---

## Task 1: Fix pre-existing bugs in `interactive.ts` (A1, A2, A4)

**Files:**
- Modify: `src/cli/output/interactive.ts:6-12,73-77,91-95,123`
- Test: `src/cli/output/context.test.ts`

- [ ] **Step 1: Write failing test — `isTTY()` should check stdin**

In `src/cli/output/context.test.ts`, add to the `InteractiveOutput` describe block:

```ts
describe('isTTY stdin check', () => {
  it('select returns default when stdin is not TTY', async () => {
    const origStdin = process.stdin.isTTY
    const origStdout = process.stdout.isTTY
    try {
      Object.defineProperty(process.stdin, 'isTTY', { value: undefined, configurable: true })
      Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true })
      const out = new InteractiveOutput()
      const result = await out.select('Pick:', ['a', 'b'], 'a')
      expect(result).toBe('a')
    } finally {
      Object.defineProperty(process.stdin, 'isTTY', { value: origStdin, configurable: true })
      Object.defineProperty(process.stdout, 'isTTY', { value: origStdout, configurable: true })
    }
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/cli/output/context.test.ts -t "stdin"`
Expected: FAIL — today `isTTY()` only checks stdout, so the select tries to prompt interactively.

- [ ] **Step 3: Fix `isTTY()` to check both stdin and stdout**

In `src/cli/output/interactive.ts`, change:

```ts
// OLD (line 10-12)
function isTTY(): boolean {
  return process.stdout.isTTY === true
}

// NEW
function isTTY(): boolean {
  return process.stdin.isTTY === true && process.stdout.isTTY === true
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/cli/output/context.test.ts -t "stdin"`
Expected: PASS

- [ ] **Step 5: Write failing test — NO_COLOR should not disable prompt interactivity**

```ts
describe('NO_COLOR does not disable prompts', () => {
  it('prompt does not auto-return default when NO_COLOR is set and stdin is TTY', async () => {
    const origNoColor = process.env['NO_COLOR']
    const origStdin = process.stdin.isTTY
    const origStdout = process.stdout.isTTY
    try {
      process.env['NO_COLOR'] = '1'
      Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true })
      Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true })
      const out = new InteractiveOutput()
      // Mock @inquirer/prompts input to return 'test'
      const prompts = await import('@inquirer/prompts')
      const inputSpy = vi.spyOn(prompts, 'input').mockResolvedValueOnce('test')
      const result = await out.prompt<string>('Name:', 'default')
      expect(result).toBe('test')
      expect(inputSpy).toHaveBeenCalled()
      inputSpy.mockRestore()
    } finally {
      if (origNoColor === undefined) delete process.env['NO_COLOR']
      else process.env['NO_COLOR'] = origNoColor
      Object.defineProperty(process.stdin, 'isTTY', { value: origStdin, configurable: true })
      Object.defineProperty(process.stdout, 'isTTY', { value: origStdout, configurable: true })
    }
  })
})
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npx vitest run src/cli/output/context.test.ts -t "NO_COLOR"`
Expected: FAIL — today `prompt` returns default immediately when `NO_COLOR` is set.

- [ ] **Step 7: Remove `isNoColor()` from prompt and confirm early returns**

In `src/cli/output/interactive.ts`:

```ts
// prompt() — line 73-77
// OLD:
  async prompt<T>(message: string, defaultValue: T): Promise<T> {
    // Non-TTY or NO_COLOR: return default immediately
    if (!isTTY() || isNoColor()) {
      return defaultValue
    }
// NEW:
  async prompt<T>(message: string, defaultValue: T): Promise<T> {
    if (!isTTY()) {
      return defaultValue
    }

// confirm() — line 91-95
// OLD:
  async confirm(message: string, defaultValue = false): Promise<boolean> {
    // Non-TTY or NO_COLOR: return default immediately
    if (!isTTY() || isNoColor()) {
      return defaultValue
    }
// NEW:
  async confirm(message: string, defaultValue = false): Promise<boolean> {
    if (!isTTY()) {
      return defaultValue
    }
```

- [ ] **Step 8: Run test to verify it passes**

Run: `npx vitest run src/cli/output/context.test.ts -t "NO_COLOR"`
Expected: PASS

- [ ] **Step 9: Write failing test — select trims input before exact match**

```ts
describe('select trims input', () => {
  it('matches option with trailing whitespace', async () => {
    const origStdin = process.stdin.isTTY
    const origStdout = process.stdout.isTTY
    try {
      Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true })
      Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true })
      const out = new InteractiveOutput()
      const prompts = await import('@inquirer/prompts')
      const inputSpy = vi.spyOn(prompts, 'input').mockResolvedValueOnce('spa ')
      const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
      const result = await out.select('Pick:', ['spa', 'ssr'], 'spa')
      expect(result).toBe('spa')
      inputSpy.mockRestore()
      writeSpy.mockRestore()
    } finally {
      Object.defineProperty(process.stdin, 'isTTY', { value: origStdin, configurable: true })
      Object.defineProperty(process.stdout, 'isTTY', { value: origStdout, configurable: true })
    }
  })
})
```

- [ ] **Step 10: Run test to verify it fails**

Run: `npx vitest run src/cli/output/context.test.ts -t "trims input"`
Expected: FAIL — today exact match uses raw `answer`, not `trimmed`.

- [ ] **Step 11: Fix the trim bug in `select`**

In `src/cli/output/interactive.ts`, change line 123-125:

```ts
// OLD (line 123-125):
    // Accept exact text match
    if (options.includes(answer)) {
      return answer

// NEW:
    // Accept exact text match (trimmed)
    if (options.includes(trimmed)) {
      return trimmed
```

- [ ] **Step 12: Run test to verify it passes**

Run: `npx vitest run src/cli/output/context.test.ts -t "trims input"`
Expected: PASS

- [ ] **Step 13: Run full test suite to check for regressions**

Run: `npx vitest run src/cli/output/context.test.ts`
Expected: All tests PASS

- [ ] **Step 14: Commit**

```bash
git add src/cli/output/interactive.ts src/cli/output/context.test.ts
git commit -m "fix: isTTY checks stdin, NO_COLOR stops disabling prompts, select trims input

Three pre-existing bugs in InteractiveOutput:
- isTTY() now checks both stdin and stdout (prevents crash on piped stdin)
- Removed isNoColor() from prompt/confirm early return (NO_COLOR is for
  stripping ANSI, not disabling interactivity)
- select() uses trimmed input for exact text matching ('spa ' now matches 'spa')"
```

---

## Task 2: Fix select re-prompt loop and ExitPromptError catch (A3, A5)

**Files:**
- Modify: `src/cli/output/interactive.ts:100-131`
- Modify: `src/cli/commands/init.ts:458`
- Test: `src/cli/output/context.test.ts`

- [ ] **Step 1: Write failing test — select re-prompts on invalid input instead of falling back**

```ts
describe('select re-prompts on invalid input', () => {
  it('loops until valid input is given', async () => {
    const origStdin = process.stdin.isTTY
    const origStdout = process.stdout.isTTY
    try {
      Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true })
      Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true })
      const out = new InteractiveOutput()
      const prompts = await import('@inquirer/prompts')
      const inputSpy = vi.spyOn(prompts, 'input')
        .mockResolvedValueOnce('invalid')
        .mockResolvedValueOnce('also-bad')
        .mockResolvedValueOnce('spa')
      const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
      const result = await out.select('Pick:', ['spa', 'ssr'], 'spa')
      expect(result).toBe('spa')
      expect(inputSpy).toHaveBeenCalledTimes(3)
      inputSpy.mockRestore()
      writeSpy.mockRestore()
    } finally {
      Object.defineProperty(process.stdin, 'isTTY', { value: origStdin, configurable: true })
      Object.defineProperty(process.stdout, 'isTTY', { value: origStdout, configurable: true })
    }
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/cli/output/context.test.ts -t "re-prompts"`
Expected: FAIL — today `select` returns fallback after one invalid input, so `inputSpy` is called only once.

- [ ] **Step 3: Rewrite `select` with a re-prompt loop**

In `src/cli/output/interactive.ts`, replace the `select` method (lines 100-131):

```ts
  async select(message: string, options: string[], defaultValue?: string): Promise<string> {
    if (!isTTY()) {
      return defaultValue ?? options[0] ?? ''
    }
    if (options.length === 0) {
      throw new Error('select() called with empty options')
    }

    process.stdout.write(`${message}\n`)
    for (let i = 0; i < options.length; i++) {
      const marker = options[i] === defaultValue ? ' (default)' : ''
      process.stdout.write(`  ${i + 1}. ${options[i]}${marker}\n`)
    }

    const { input } = await import('@inquirer/prompts')

    for (;;) {
      const answer = await input({
        message: 'Enter number or text:',
        default: defaultValue,
      })
      const trimmed = answer.trim()

      if (/^\d+$/.test(trimmed)) {
        const num = Number(trimmed)
        if (num >= 1 && num <= options.length) {
          return options[num - 1] ?? defaultValue ?? options[0] ?? ''
        }
      }

      if (options.includes(trimmed)) {
        return trimmed
      }

      process.stdout.write(`  Invalid input "${trimmed}". Pick a number (1-${options.length}) or type a value.\n`)
    }
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/cli/output/context.test.ts -t "re-prompts"`
Expected: PASS

- [ ] **Step 5: Apply the same re-prompt pattern to `multiSelect`**

Replace `multiSelect` method (lines 133-164) with the same loop pattern. On invalid parse (no valid selections from the comma-separated input), print an error and re-prompt instead of falling back to defaults.

```ts
  async multiSelect(message: string, options: string[], defaults?: string[]): Promise<string[]> {
    if (!isTTY()) {
      return defaults ?? []
    }

    process.stdout.write(`${message}\n`)
    for (let i = 0; i < options.length; i++) {
      const isDefault = defaults?.includes(options[i] ?? '') ? ' *' : ''
      process.stdout.write(`  ${i + 1}. ${options[i]}${isDefault}\n`)
    }

    const { input } = await import('@inquirer/prompts')

    for (;;) {
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
      if (selected.length > 0) {
        return selected
      }

      if (answer.trim() === '') {
        return defaults ?? []
      }

      process.stdout.write(`  No valid selections. Pick numbers (1-${options.length}) or type values, comma-separated.\n`)
    }
  }
```

- [ ] **Step 6: Add ExitPromptError catch in `init.ts`**

In `src/cli/commands/init.ts`, wrap the `runWizard()` call (around line 458):

```ts
// At the top of init.ts, add import:
import { ExitPromptError } from '@inquirer/core'

// Around line 458, wrap the runWizard call:
    let result: WizardResult
    try {
      result = await runWizard({
        projectRoot,
        auto: argv.auto ?? false,
        // ... existing args ...
      })
    } catch (err) {
      if (err instanceof ExitPromptError) {
        output.info('Cancelled.')
        process.exit(130)
        return
      }
      throw err
    }
```

- [ ] **Step 7: Run full test suite**

Run: `npx vitest run src/cli/output/context.test.ts && npx vitest run src/wizard/wizard.test.ts`
Expected: All PASS

- [ ] **Step 8: Commit**

```bash
git add src/cli/output/interactive.ts src/cli/output/context.test.ts src/cli/commands/init.ts
git commit -m "fix: select re-prompts on invalid input, catch Ctrl-C in init

- select() and multiSelect() now loop on invalid input instead of
  silently returning the default
- init command catches ExitPromptError from @inquirer/prompts so
  Ctrl-C exits cleanly with exit code 130 instead of a stack trace"
```

---

## Task 3: Extend OutputContext API with SelectOption, help, supportsInteractivePrompts

**Files:**
- Modify: `src/cli/output/context.ts`
- Modify: `src/cli/output/interactive.ts`
- Modify: `src/cli/output/auto.ts`
- Modify: `src/cli/output/json.ts`
- Test: `src/cli/output/context.test.ts`

- [ ] **Step 1: Add `SelectOption` type and update `OutputContext` interface**

In `src/cli/output/context.ts`, add the type and update all method signatures:

```ts
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

  supportsInteractivePrompts(): boolean

  // User prompts
  prompt<T>(message: string, defaultValue: T, help?: { short?: string }): Promise<T>
  confirm(message: string, defaultValue?: boolean, help?: { short?: string }): Promise<boolean>

  /** defaultValue is a value (not a label). */
  select(
    message: string,
    options: SelectOption[],
    defaultValue?: string,
    help?: { short?: string; long?: string },
  ): Promise<string>

  /** Multi-choice selection. Returns selected values. */
  multiSelect(
    message: string,
    options: SelectOption[],
    defaults?: string[],
    help?: { short?: string; long?: string },
  ): Promise<string[]>

  /** No long help, no ? interception on free-text input. */
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
```

- [ ] **Step 2: Update `InteractiveOutput` to implement the new methods**

In `src/cli/output/interactive.ts`, add `supportsInteractivePrompts()`:

```ts
  supportsInteractivePrompts(): boolean {
    return isTTY()
  }
```

Update `prompt` signature to accept `help?` param (it ignores it for now — rendering comes in Task 5):

```ts
  async prompt<T>(message: string, defaultValue: T, _help?: { short?: string }): Promise<T> {
```

Update `confirm` similarly:

```ts
  async confirm(message: string, defaultValue = false, _help?: { short?: string }): Promise<boolean> {
```

Update `select` and `multiSelect` signatures to accept `SelectOption[]` and `help?`:

```ts
  async select(message: string, options: SelectOption[], defaultValue?: string, _help?: { short?: string; long?: string }): Promise<string> {
```

```ts
  async multiSelect(message: string, options: SelectOption[], defaults?: string[], _help?: { short?: string; long?: string }): Promise<string[]> {
```

Update `multiInput`:

```ts
  async multiInput(message: string, defaultValue?: string[], _help?: { short?: string }): Promise<string[]> {
```

Add normalization at the top of `select` and `multiSelect`:

```ts
    const normalized = options.map(o => typeof o === 'string' ? { value: o } : o)
```

Then replace all `options[i]`, `options.includes(...)`, and `options.length` with `normalized[i].value`, `normalized.some(n => n.value === ...)`, `normalized.length`.

Import `SelectOption` from `context.js` at the top of `interactive.ts`:

```ts
import type { OutputContext, SelectOption } from './context.js'
```

- [ ] **Step 3: Update `AutoOutput` to match new signatures**

In `src/cli/output/auto.ts`, update every prompt method to accept and ignore the new params:

```ts
  supportsInteractivePrompts(): boolean {
    return false
  }

  async prompt<T>(message: string, defaultValue: T, _help?: { short?: string }): Promise<T> {
    process.stderr.write(`(auto) Using default for: ${message}\n`)
    return defaultValue
  }

  async confirm(message: string, defaultValue = false, _help?: { short?: string }): Promise<boolean> {
    process.stderr.write(`(auto) Confirming: ${message}\n`)
    return defaultValue
  }

  async select(_msg: string, options: SelectOption[], defaultValue?: string, _help?: { short?: string; long?: string }): Promise<string> {
    const first = typeof options[0] === 'string' ? options[0] : options[0]?.value
    return defaultValue ?? first ?? ''
  }

  async multiSelect(_msg: string, _options: SelectOption[], defaults?: string[], _help?: { short?: string; long?: string }): Promise<string[]> {
    return defaults ?? []
  }

  async multiInput(_msg: string, defaultValue?: string[], _help?: { short?: string }): Promise<string[]> {
    return defaultValue ?? []
  }
```

Add import at top:

```ts
import type { OutputContext, SelectOption } from './context.js'
```

- [ ] **Step 4: Update `JsonOutput` the same way**

In `src/cli/output/json.ts`, same changes — add `supportsInteractivePrompts(): boolean { return false }`, update method signatures, add `SelectOption` import.

- [ ] **Step 5: Update test mock helper `makeOutputContext()`**

In both `src/cli/output/context.test.ts` and `src/wizard/wizard.test.ts`, add `supportsInteractivePrompts` to the mock:

```ts
function makeOutputContext() {
  return {
    // ... existing mocks ...
    supportsInteractivePrompts: vi.fn().mockReturnValue(false),
  }
}
```

- [ ] **Step 6: Run full test suite**

Run: `make check-all`
Expected: All PASS. The `SelectOption` type is backward-compatible — `string[]` is assignable to `SelectOption[]`.

- [ ] **Step 7: Commit**

```bash
git add src/cli/output/context.ts src/cli/output/interactive.ts src/cli/output/auto.ts src/cli/output/json.ts src/cli/output/context.test.ts src/wizard/wizard.test.ts
git commit -m "feat: extend OutputContext with SelectOption, help params, supportsInteractivePrompts

- SelectOption type: string | { value, label?, short? }
- Optional help? param on all 5 prompt methods
- supportsInteractivePrompts() method for banner gating
- All three OutputContext implementations updated
- Backward compatible: string[] still accepted everywhere"
```

---

## Task 4: Rewrite InteractiveOutput.select with rich rendering and ? handling

**Files:**
- Modify: `src/cli/output/interactive.ts:100-131`
- Test: `src/cli/output/context.test.ts`

- [ ] **Step 1: Write failing test — select renders friendly labels from rich options**

```ts
describe('select with rich options', () => {
  it('renders label and returns value', async () => {
    const origStdin = process.stdin.isTTY
    const origStdout = process.stdout.isTTY
    try {
      Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true })
      Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true })
      const out = new InteractiveOutput()
      const prompts = await import('@inquirer/prompts')
      const inputSpy = vi.spyOn(prompts, 'input').mockResolvedValueOnce('1')
      const writes: string[] = []
      const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation((s) => { writes.push(String(s)); return true })
      const result = await out.select(
        'Pick:',
        [{ value: 'spa', label: 'Single-page app (SPA)', short: 'Client renders.' }],
        'spa',
      )
      expect(result).toBe('spa')
      const output = writes.join('')
      expect(output).toContain('Single-page app (SPA)')
      expect(output).toContain('Client renders.')
      inputSpy.mockRestore()
      writeSpy.mockRestore()
    } finally {
      Object.defineProperty(process.stdin, 'isTTY', { value: origStdin, configurable: true })
      Object.defineProperty(process.stdout, 'isTTY', { value: origStdout, configurable: true })
    }
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/cli/output/context.test.ts -t "rich options"`
Expected: FAIL — current select only prints raw `options[i]`, not labels.

- [ ] **Step 3: Write failing test — `?` triggers long help**

```ts
describe('select ? for help', () => {
  it('prints long help and re-prompts', async () => {
    const origStdin = process.stdin.isTTY
    const origStdout = process.stdout.isTTY
    try {
      Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true })
      Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true })
      const out = new InteractiveOutput()
      const prompts = await import('@inquirer/prompts')
      const inputSpy = vi.spyOn(prompts, 'input')
        .mockResolvedValueOnce('?')
        .mockResolvedValueOnce('1')
      const writes: string[] = []
      const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation((s) => { writes.push(String(s)); return true })
      const result = await out.select(
        'Pick:',
        ['spa', 'ssr'],
        'spa',
        { long: 'Detailed help text here.' },
      )
      expect(result).toBe('spa')
      expect(inputSpy).toHaveBeenCalledTimes(2)
      const output = writes.join('')
      expect(output).toContain('Detailed help text here.')
      inputSpy.mockRestore()
      writeSpy.mockRestore()
    } finally {
      Object.defineProperty(process.stdin, 'isTTY', { value: origStdin, configurable: true })
      Object.defineProperty(process.stdout, 'isTTY', { value: origStdout, configurable: true })
    }
  })
})
```

- [ ] **Step 4: Implement the full `select` rewrite**

Replace `InteractiveOutput.select` with the complete implementation:

```ts
  async select(
    message: string,
    options: SelectOption[],
    defaultValue?: string,
    help?: { short?: string; long?: string },
  ): Promise<string> {
    if (!isTTY()) {
      const first = typeof options[0] === 'string' ? options[0] : options[0]?.value
      return defaultValue ?? first ?? ''
    }
    if (options.length === 0) {
      throw new Error('select() called with empty options')
    }

    const normalized = options.map(o => typeof o === 'string' ? { value: o } : o)
    const { input } = await import('@inquirer/prompts')

    const renderFrame = (): void => {
      if (help?.short) {
        process.stdout.write(dim(`  ${help.short}`) + '\n')
      }
      const suffix = help?.long ? ' (? for help)' : ''
      process.stdout.write(`${message}${suffix}\n`)
      for (let i = 0; i < normalized.length; i++) {
        const n = normalized[i]!
        const displayName = n.label ?? n.value
        const marker = n.value === defaultValue ? ' (default)' : ''
        process.stdout.write(`  ${i + 1}. ${displayName}${marker}\n`)
        if (n.short) {
          process.stdout.write(dim(`     ${n.short}`) + '\n')
        }
      }
    }

    renderFrame()

    for (;;) {
      const answer = await input({
        message: 'Enter number or text:',
        default: defaultValue,
      })
      const trimmed = answer.trim()

      if (trimmed === '?') {
        if (help?.long) {
          process.stdout.write('\n' + dim(`  ${help.long}`) + '\n\n')
          renderFrame()
        } else {
          const names = normalized.map(n => n.value).join(', ')
          process.stdout.write(`  No additional help available — pick one of: ${names}\n`)
        }
        continue
      }

      if (/^\d+$/.test(trimmed)) {
        const num = Number(trimmed)
        if (num >= 1 && num <= normalized.length) {
          return normalized[num - 1]!.value
        }
      }

      const match = normalized.find(n => n.value === trimmed)
      if (match) {
        return match.value
      }

      process.stdout.write(`  Invalid input "${trimmed}". Pick a number (1-${normalized.length}) or type a value.\n`)
    }
  }
```

Add the `dim` helper near the top of `interactive.ts` with the other color helpers:

```ts
function dim(s: string): string {
  return isNoColor() || !isTTY() ? s : `\x1b[2m${s}\x1b[0m`
}
```

- [ ] **Step 5: Apply the same pattern to `multiSelect`**

Rewrite `multiSelect` with normalization, `?` handling (lone `?` only), re-prompt loop, and hanging-indent rendering. Same structure as `select` but comma-separated parsing.

- [ ] **Step 6: Add dim hint rendering to `prompt` and `confirm`**

Update `prompt` to print `help.short` when set:

```ts
  async prompt<T>(message: string, defaultValue: T, help?: { short?: string }): Promise<T> {
    if (!isTTY()) {
      return defaultValue
    }
    if (help?.short) {
      process.stdout.write(dim(`  ${help.short}`) + '\n')
    }
    const { input } = await import('@inquirer/prompts')
    // ... rest unchanged
  }
```

Same for `confirm`:

```ts
  async confirm(message: string, defaultValue = false, help?: { short?: string }): Promise<boolean> {
    if (!isTTY()) {
      return defaultValue
    }
    if (help?.short) {
      process.stdout.write(dim(`  ${help.short}`) + '\n')
    }
    const { confirm } = await import('@inquirer/prompts')
    return confirm({ message, default: defaultValue })
  }
```

- [ ] **Step 7: Run all tests**

Run: `npx vitest run src/cli/output/context.test.ts`
Expected: All PASS

- [ ] **Step 8: Commit**

```bash
git add src/cli/output/interactive.ts src/cli/output/context.test.ts
git commit -m "feat: select/multiSelect with rich options, ? help, hanging-indent rendering

- Normalizes SelectOption[] to { value, label?, short? } at entry
- Renders friendly labels with hanging-indent descriptions
- Typing ? shows long help (when defined), then re-renders options
- dim() helper for short hints and descriptions
- prompt/confirm print dim short hint above when help.short is set"
```

---

## Task 5: Add copy type infrastructure

**Files:**
- Create: `src/wizard/copy/types.ts`
- Create: `src/wizard/copy/types.test-d.ts`

- [ ] **Step 1: Create `src/wizard/copy/types.ts`**

```ts
import type {
  ProjectType, WebAppConfig, BackendConfig, CliConfig, LibraryConfig,
  MobileAppConfig, DataPipelineConfig, MlConfig, BrowserExtensionConfig,
  GameConfig,
} from '../../types/index.js'

export type ValueToOptionKey<T> = T extends readonly (infer U)[] ? U : T

export type OptionCopy = {
  label: string
  short?: string
}

export type QuestionCopy<TValue = unknown> = {
  short?: string
  long?: string
  options?: Extract<ValueToOptionKey<TValue>, string> extends never
    ? never
    : string extends Extract<ValueToOptionKey<TValue>, string>
      ? never
      : Record<Extract<ValueToOptionKey<TValue>, string>, OptionCopy>
}

export type WebAppCopy           = { [K in keyof WebAppConfig]:           QuestionCopy<WebAppConfig[K]> }
export type BackendCopy          = { [K in keyof BackendConfig]:          QuestionCopy<BackendConfig[K]> }
export type CliCopy              = { [K in keyof CliConfig]:              QuestionCopy<CliConfig[K]> }
export type LibraryCopy          = { [K in keyof LibraryConfig]:          QuestionCopy<LibraryConfig[K]> }
export type MobileAppCopy        = { [K in keyof MobileAppConfig]:        QuestionCopy<MobileAppConfig[K]> }
export type DataPipelineCopy     = { [K in keyof DataPipelineConfig]:     QuestionCopy<DataPipelineConfig[K]> }
export type MlCopy               = { [K in keyof MlConfig]:               QuestionCopy<MlConfig[K]> }
export type BrowserExtensionCopy = { [K in keyof BrowserExtensionConfig]: QuestionCopy<BrowserExtensionConfig[K]> }
export type GameCopy             = { [K in keyof GameConfig]:             QuestionCopy<GameConfig[K]> }

export type WizardQuestionId =
  | 'methodology' | 'depth'
  | 'codexAdapter' | 'geminiAdapter'
  | 'webTrait' | 'mobileTrait'
  | 'projectType' | 'advancedGameGate'

export type CoreCopy = Record<WizardQuestionId, QuestionCopy<string>>

export interface ProjectCopyMap {
  'web-app':           WebAppCopy
  'backend':           BackendCopy
  'cli':               CliCopy
  'library':           LibraryCopy
  'mobile-app':        MobileAppCopy
  'data-pipeline':     DataPipelineCopy
  'ml':                MlCopy
  'browser-extension': BrowserExtensionCopy
  'game':              GameCopy
}
```

- [ ] **Step 2: Create `src/wizard/copy/types.test-d.ts`**

```ts
import { describe, it, expectTypeOf } from 'vitest'
import type {
  WebAppCopy, LibraryCopy, GameCopy, BackendCopy, ProjectCopyMap, OptionCopy,
} from './types.js'

describe('QuestionCopy type-level tests', () => {
  it('WebAppCopy.renderingStrategy.options requires exact enum keys', () => {
    expectTypeOf<NonNullable<WebAppCopy['renderingStrategy']['options']>>()
      .toEqualTypeOf<Record<'spa' | 'ssr' | 'ssg' | 'hybrid', OptionCopy>>()
  })

  it('LibraryCopy.hasTypeDefinitions.options is never (boolean field)', () => {
    expectTypeOf<LibraryCopy['hasTypeDefinitions']>()
      .toHaveProperty('options')
    type Opts = LibraryCopy['hasTypeDefinitions']['options']
    expectTypeOf<Opts>().toBeNever()
  })

  it('GameCopy.supportedLocales.options is never (bare string[])', () => {
    type Opts = GameCopy['supportedLocales']['options']
    expectTypeOf<Opts>().toBeNever()
  })

  it('BackendCopy.dataStore.options requires array element enum keys', () => {
    expectTypeOf<NonNullable<BackendCopy['dataStore']['options']>>()
      .toEqualTypeOf<Record<'relational' | 'document' | 'key-value', OptionCopy>>()
  })

  it('getCopyForType narrows to the correct type', () => {
    expectTypeOf<ProjectCopyMap['web-app']>().toEqualTypeOf<WebAppCopy>()
    expectTypeOf<ProjectCopyMap['game']>().toEqualTypeOf<GameCopy>()
  })
})
```

- [ ] **Step 3: Run type-level tests**

Run: `npx vitest typecheck src/wizard/copy/types.test-d.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/wizard/copy/types.ts src/wizard/copy/types.test-d.ts
git commit -m "feat: add wizard copy type infrastructure with compile-time enum enforcement

ValueToOptionKey extracts array element types so multiSelect enum fields
get the same exhaustive enforcement as single-select fields. Bare string
types are explicitly banned from options to prevent spurious copy entries
on free-text fields like supportedLocales."
```

---

## Task 6: Create copy content files and index

**Files:**
- Create: `src/wizard/copy/index.ts`
- Create: `src/wizard/copy/core.ts`
- Create: `src/wizard/copy/web-app.ts`
- Create: `src/wizard/copy/backend.ts`
- Create: `src/wizard/copy/cli.ts`
- Create: `src/wizard/copy/library.ts`
- Create: `src/wizard/copy/mobile-app.ts`
- Create: `src/wizard/copy/data-pipeline.ts`
- Create: `src/wizard/copy/ml.ts`
- Create: `src/wizard/copy/browser-extension.ts`
- Create: `src/wizard/copy/game.ts`

- [ ] **Step 1: Create `src/wizard/copy/index.ts`**

```ts
import type { ProjectType } from '../../types/index.js'
import type { SelectOption } from '../../cli/output/context.js'
import type { OptionCopy, ProjectCopyMap } from './types.js'
import { coreCopy } from './core.js'
import { webAppCopy } from './web-app.js'
import { backendCopy } from './backend.js'
import { cliCopy } from './cli.js'
import { libraryCopy } from './library.js'
import { mobileAppCopy } from './mobile-app.js'
import { dataPipelineCopy } from './data-pipeline.js'
import { mlCopy } from './ml.js'
import { browserExtensionCopy } from './browser-extension.js'
import { gameCopy } from './game.js'

const PROJECT_COPY: ProjectCopyMap = {
  'web-app': webAppCopy,
  'backend': backendCopy,
  'cli': cliCopy,
  'library': libraryCopy,
  'mobile-app': mobileAppCopy,
  'data-pipeline': dataPipelineCopy,
  'ml': mlCopy,
  'browser-extension': browserExtensionCopy,
  'game': gameCopy,
}

export function getCopyForType<T extends ProjectType>(type: T): ProjectCopyMap[T] {
  return PROJECT_COPY[type]
}

export function optionsFromCopy<T extends string>(
  copy: Record<T, OptionCopy>,
  values: readonly T[],
): SelectOption[] {
  return values.map(v => ({ value: v, label: copy[v].label, short: copy[v].short }))
}

export { coreCopy }
```

- [ ] **Step 2: Create `src/wizard/copy/core.ts`**

Use the example from the design spec (`docs/superpowers/specs/2026-04-11-wizard-helper-text-design.md`, "core.ts and per-type copy file shape" section). Write all 8 `WizardQuestionId` entries with real copy — methodology, depth, codexAdapter, geminiAdapter, webTrait, mobileTrait, projectType (with all 9 `options`), advancedGameGate.

- [ ] **Step 3: Create `src/wizard/copy/web-app.ts`**

Use the example from the design spec. Write all 4 `WebAppConfig` field entries — `renderingStrategy`, `deployTarget`, `realtime`, `authFlow` — with complete `options` for each enum.

- [ ] **Step 4: Create the remaining 8 copy files**

Each file follows the same pattern as `web-app.ts`. For each config type, export a `satisfies` typed constant with entries for every field in the config. Enum fields get `options` with `label` and `short` for every value. Boolean and free-text fields get only `short` (optionally `long`), no `options`.

Files:
- `src/wizard/copy/backend.ts` — `BackendCopy` (apiStyle, dataStore, authMechanism, asyncMessaging, deployTarget)
- `src/wizard/copy/cli.ts` — `CliCopy` (interactivity, distributionChannels, hasStructuredOutput)
- `src/wizard/copy/library.ts` — `LibraryCopy` (visibility, runtimeTarget, bundleFormat, hasTypeDefinitions, documentationLevel)
- `src/wizard/copy/mobile-app.ts` — `MobileAppCopy` (platform, distributionModel, offlineSupport, hasPushNotifications)
- `src/wizard/copy/data-pipeline.ts` — `DataPipelineCopy` (processingModel, orchestration, dataQualityStrategy, schemaManagement, hasDataCatalog)
- `src/wizard/copy/ml.ts` — `MlCopy` (projectPhase, modelType, servingPattern, hasExperimentTracking)
- `src/wizard/copy/browser-extension.ts` — `BrowserExtensionCopy` (manifestVersion, uiSurfaces, hasContentScript, hasBackgroundWorker)
- `src/wizard/copy/game.ts` — `GameCopy` (engine, multiplayerMode, targetPlatforms, onlineServices, contentStructure, economy, narrative, supportedLocales, npcAiComplexity, hasModding, persistence)

- [ ] **Step 5: Verify compilation**

Run: `npx tsc --noEmit`
Expected: PASS — any missing enum key or wrong field name is a compile error.

- [ ] **Step 6: Commit**

```bash
git add src/wizard/copy/
git commit -m "feat: add wizard copy content for all 9 project types + core questions

Per-option descriptions for every select/multiSelect enum in the wizard.
Type-checked against config schemas — adding an enum value without
matching copy is a compile error."
```

---

## Task 7: Thread copy through questions.ts and add banner

**Files:**
- Modify: `src/wizard/questions.ts`
- Test: `src/wizard/wizard.test.ts`

- [ ] **Step 1: Import copy modules at the top of `questions.ts`**

```ts
import { coreCopy, getCopyForType, optionsFromCopy } from './copy/index.js'
```

- [ ] **Step 2: Add the first-prompt banner before `projectType` select**

In `questions.ts`, just before the `projectType` select (around line 114), add:

```ts
  // First-prompt banner — shown once, only in interactive mode
  if (!auto && output.supportsInteractivePrompts()) {
    output.info('Tip: Type ? at any choice prompt to see help.')
  }
```

- [ ] **Step 3: Thread copy through the `projectType` select**

```ts
  // Before:
  const selected = await output.select(
    'What type of project is this?',
    [...ProjectTypeSchema.options],
    'web-app',
  )

  // After:
  const ptCopy = coreCopy.projectType
  const selected = await output.select(
    'What type of project is this?',
    optionsFromCopy(ptCopy.options!, [...ProjectTypeSchema.options]),
    'web-app',
    ptCopy,
  )
```

- [ ] **Step 4: Thread copy through one project-type branch (web-app) as a template**

```ts
  if (projectType === 'web-app') {
    const copy = getCopyForType('web-app')

    const renderingStrategy: WebAppConfig['renderingStrategy'] = options.webAppFlags?.webRendering
      ?? await output.select(
        'Rendering strategy?',
        optionsFromCopy(copy.renderingStrategy.options!, ['spa', 'ssr', 'ssg', 'hybrid']),
        undefined,
        copy.renderingStrategy,
      ) as WebAppConfig['renderingStrategy']

    // ... repeat for deployTarget, realtime, authFlow
  }
```

- [ ] **Step 5: Thread copy through the remaining 8 project-type branches**

Follow the same pattern for each branch: call `getCopyForType('backend')`, use `optionsFromCopy(copy.<field>.options!, [...values])` for selects, pass `copy.<field>` as the `help` arg. For confirms, pass `{ short: copy.<field>.short }` as the `help` arg.

- [ ] **Step 6: Thread copy through top-level confirms (adapters, traits)**

```ts
  // Before:
  const addCodex = await output.confirm('Include Codex adapter?', false)

  // After:
  const addCodex = await output.confirm('Include Codex adapter?', false, coreCopy.codexAdapter)
```

Same for `geminiAdapter`, `webTrait`, `mobileTrait`.

- [ ] **Step 7: Thread copy through methodology prompt**

```ts
  // Before:
  const answer = await output.prompt<string>(
    `Select methodology (deep/mvp/custom) [${suggestion}]:`,
    suggestion,
  )

  // After:
  const answer = await output.prompt<string>(
    `Select methodology (deep/mvp/custom) [${suggestion}]:`,
    suggestion,
    coreCopy.methodology,
  )
```

- [ ] **Step 8: Run full test suite**

Run: `make check-all`
Expected: All PASS. Existing tests pass because mock `select`/`confirm`/`prompt` ignore extra args.

- [ ] **Step 9: Commit**

```bash
git add src/wizard/questions.ts
git commit -m "feat: thread helper text copy through all wizard prompts

Every select/multiSelect shows per-option descriptions with friendly
labels. Confirms and prompts show a dim short hint when copy provides
one. First-prompt banner appears before projectType select."
```

---

## Task 8: Integration tests and final verification

**Files:**
- Modify: `src/wizard/wizard.test.ts`

- [ ] **Step 1: Add integration test — banner prints once in interactive mode**

```ts
it('prints first-prompt banner before projectType in interactive mode', async () => {
  const output = makeOutputContext()
  vi.mocked(output.supportsInteractivePrompts).mockReturnValue(true)
  vi.mocked(output.prompt).mockResolvedValueOnce('deep')
  vi.mocked(output.confirm)
    .mockResolvedValueOnce(false)
    .mockResolvedValueOnce(false)
    .mockResolvedValueOnce(false)
    .mockResolvedValueOnce(false)
  vi.mocked(output.select).mockResolvedValueOnce('web-app')
  // ... mock remaining web-app selects

  await runWizard({ /* ... */ })

  expect(output.info).toHaveBeenCalledWith(
    expect.stringContaining('Type ? at any choice prompt'),
  )
})
```

- [ ] **Step 2: Add integration test — banner does NOT print in auto mode**

```ts
it('does not print banner in auto mode', async () => {
  const output = makeOutputContext()
  await runWizard({ /* ... auto: true ... */ })
  expect(output.info).not.toHaveBeenCalledWith(
    expect.stringContaining('Type ?'),
  )
})
```

- [ ] **Step 3: Run all tests**

Run: `make check-all`
Expected: All PASS

- [ ] **Step 4: Commit**

```bash
git add src/wizard/wizard.test.ts
git commit -m "test: add integration tests for wizard helper text banner"
```

- [ ] **Step 5: Manual smoke test**

Run in a real terminal:
1. `scaffold init` — walk through web-app, backend, game branches. Verify descriptions render, `?` works, friendly labels appear.
2. `NO_COLOR=1 scaffold init` — verify all questions are still asked interactively.
3. `scaffold init --auto --project-type web-app --web-rendering ssr --web-deploy-target serverless --web-realtime none --web-auth-flow none` — verify no banner, no helper text.

---

## Self-Review

**Spec coverage:** Every section of the design spec maps to at least one task:
- A1 (NO_COLOR) → Task 1, Steps 5-8
- A2 (stdin TTY) → Task 1, Steps 1-4
- A3 (re-prompt loop) → Task 2, Steps 1-5
- A4 (trim) → Task 1, Steps 9-12
- A5 (ExitPromptError) → Task 2, Step 6
- OutputContext extension → Task 3
- select/multiSelect rewrite → Task 4
- Copy types → Task 5
- Copy content → Task 6
- Thread through questions.ts → Task 7
- Banner → Task 7, Step 2
- Integration tests → Task 8
- Manual smoke → Task 8, Step 5

**Placeholder scan:** No TBD/TODO. Task 6 Step 4 describes a mechanical process (creating 8 files following the pattern of Steps 2-3) — the exact content for each enum's `label` and `short` must be authored during implementation, not in the plan.

**Type consistency:** `SelectOption` defined in Task 3 Step 1; used in Tasks 4, 6, 7. `QuestionCopy<TValue>` defined in Task 5 Step 1; used in Task 6. `optionsFromCopy` defined in Task 6 Step 1; used in Task 7. `supportsInteractivePrompts()` defined in Task 3; used in Task 7. All names consistent.
