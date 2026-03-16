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

  it('returns "interactive" when no flags are set', () => {
    const result: OutputMode = resolveOutputMode({})
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

  it('sets argv.outputMode to "interactive" for empty argv', () => {
    const middleware = createOutputModeMiddleware()
    const argv: Record<string, unknown> = {}
    middleware(argv)
    expect(argv['outputMode']).toBe('interactive')
  })
})
