import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

describe('mmr explain', () => {
  let logSpy: ReturnType<typeof vi.spyOn>
  beforeEach(() => { logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined) })
  afterEach(() => { vi.restoreAllMocks() })

  it('explains a known topic', async () => {
    const { explainCommand } = await import('../../src/commands/explain.js')
    await explainCommand.handler({ topic: 'compensation', _: ['explain'], $0: 'mmr' } as never)
    const out = logSpy.mock.calls.map((c) => String(c[0])).join('\n')
    expect(out).toMatch(/structural/i)
    expect(out).toMatch(/compensate-missing/)
  })

  it('lists topics when given no argument', async () => {
    const { explainCommand } = await import('../../src/commands/explain.js')
    await explainCommand.handler({ _: ['explain'], $0: 'mmr' } as never)
    const out = logSpy.mock.calls.map((c) => String(c[0])).join('\n')
    expect(out).toMatch(/channels/)
    expect(out).toMatch(/Topics:/)
  })

  it('errors and lists topics on an unknown topic', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never)
    const { explainCommand } = await import('../../src/commands/explain.js')
    await explainCommand.handler({ topic: 'nonsense', _: ['explain'], $0: 'mmr' } as never)
    expect(exitSpy).toHaveBeenCalledWith(1)
    expect(errSpy.mock.calls.map((c) => String(c[0])).join('\n')).toMatch(/Unknown topic/)
    errSpy.mockRestore()
    exitSpy.mockRestore()
  })
})
