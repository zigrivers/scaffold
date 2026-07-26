import { describe, it, expect } from 'vitest'
import { resolveOutputMode, createOutputModeMiddleware } from './output-mode.js'
import type { OutputMode } from '../../types/enums.js'

describe('resolveOutputMode', () => {
  it('returns "json" when format is "json"', () => {
    const result: OutputMode = resolveOutputMode({ format: 'json' })
    expect(result).toBe('json')
  })

  it('returns "auto" when auto is true', () => {
    const result: OutputMode = resolveOutputMode({ auto: true })
    expect(result).toBe('auto')
  })

  it('returns "interactive" when no flags are set and the streams are TTYs', () => {
    // Must inject TTY state: under D1 a non-TTY resolves to 'auto', and the
    // test process is not a TTY.
    const result: OutputMode = resolveOutputMode({}, { stdin: true, stdout: true })
    expect(result).toBe('interactive')
  })

  it('returns "json" when both format and auto are set (format takes priority)', () => {
    const result: OutputMode = resolveOutputMode({ format: 'json', auto: true })
    expect(result).toBe('json')
  })
})

describe('createOutputModeMiddleware', () => {
  it('sets argv.outputMode to "json" when format is "json"', () => {
    const middleware = createOutputModeMiddleware()
    const argv: Record<string, unknown> = { format: 'json' }
    middleware(argv)
    expect(argv['outputMode']).toBe('json')
  })

  it('sets argv.outputMode to "auto" when auto is true', () => {
    const middleware = createOutputModeMiddleware()
    const argv: Record<string, unknown> = { auto: true }
    middleware(argv)
    expect(argv['outputMode']).toBe('auto')
  })

  it('sets argv.outputMode to "interactive" for empty argv on a TTY', () => {
    const middleware = createOutputModeMiddleware({ stdin: true, stdout: true })
    const argv: Record<string, unknown> = {}
    middleware(argv)
    expect(argv['outputMode']).toBe('interactive')
  })
})

describe('non-TTY resolution (Task 6)', () => {
  it('returns "auto" when no flags are set and stdout is not a TTY', () => {
    expect(resolveOutputMode({}, { stdin: false, stdout: false })).toBe('auto')
  })

  it('returns "interactive" when no flags are set and both streams are TTYs', () => {
    expect(resolveOutputMode({}, { stdin: true, stdout: true })).toBe('interactive')
  })

  it('returns "auto" when only stdin is redirected', () => {
    expect(resolveOutputMode({}, { stdin: false, stdout: true })).toBe('auto')
  })

  it('still lets --format json win over a non-TTY', () => {
    expect(resolveOutputMode({ format: 'json' }, { stdin: false, stdout: false })).toBe('json')
  })
})

describe('argv.auto normalization (Task 6)', () => {
  // Changing only the output context is NOT enough. The discriminator checks
  // read options.auto, which init.ts fills from the explicit --auto flag, so
  // without this a piped run still invents a config while merely *printing*
  // differently.
  it('sets argv.auto when the resolved mode is non-interactive', () => {
    const middleware = createOutputModeMiddleware({ stdin: false, stdout: false })
    const argv: Record<string, unknown> = {}
    middleware(argv)
    expect(argv['outputMode']).toBe('auto')
    expect(argv['auto']).toBe(true)
  })

  it('sets argv.auto for json mode even when both streams ARE TTYs', () => {
    // The second, easier-to-miss half of the D1 break: JsonOutput never
    // prompts, so it was silently defaulting too.
    const middleware = createOutputModeMiddleware({ stdin: true, stdout: true })
    const argv: Record<string, unknown> = { format: 'json' }
    middleware(argv)
    expect(argv['auto']).toBe(true)
  })

  it('leaves argv.auto untouched in genuine interactive mode', () => {
    const middleware = createOutputModeMiddleware({ stdin: true, stdout: true })
    const argv: Record<string, unknown> = { auto: false }
    middleware(argv)
    expect(argv['outputMode']).toBe('interactive')
    expect(argv['auto']).toBe(false)
  })
})
