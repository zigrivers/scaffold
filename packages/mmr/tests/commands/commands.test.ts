import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

describe('mmr commands', () => {
  let logSpy: ReturnType<typeof vi.spyOn>
  beforeEach(() => { logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined) })
  afterEach(() => { logSpy.mockRestore() })

  it('emits a machine-readable manifest with --format json', async () => {
    const { commandsCommand } = await import('../../src/commands/commands.js')
    await commandsCommand.handler({ format: 'json', _: ['commands'], $0: 'mmr' } as never)
    const specs = JSON.parse(String(logSpy.mock.calls.at(-1)?.[0])) as Array<{ command: string; example: string; writes: boolean }>
    expect(specs.find((s) => s.command.startsWith('config disable'))?.writes).toBe(true)
    expect(specs.find((s) => s.command.startsWith('config path'))?.writes).toBe(false)
    expect(specs.find((s) => s.command === 'doctor')).toBeTruthy()
    // every spec has a runnable example
    expect(specs.every((s) => s.example.startsWith('mmr '))).toBe(true)
  })

  it('prints a human table by default', async () => {
    const { commandsCommand } = await import('../../src/commands/commands.js')
    await commandsCommand.handler({ format: 'text', _: ['commands'], $0: 'mmr' } as never)
    const out = logSpy.mock.calls.map((c) => String(c[0])).join('\n')
    expect(out).toMatch(/config disable <channel>/)
    expect(out).toMatch(/doctor/)
  })
})
