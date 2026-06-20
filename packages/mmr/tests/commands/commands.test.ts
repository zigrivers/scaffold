import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

describe('mmr commands', () => {
  let logSpy: ReturnType<typeof vi.spyOn>
  beforeEach(() => { logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined) })
  afterEach(() => { logSpy.mockRestore() })

  it('emits a machine-readable manifest with the --json shorthand', async () => {
    const { commandsCommand } = await import('../../src/commands/commands.js')
    await commandsCommand.handler({ json: true, _: ['commands'], $0: 'mmr' } as never)
    const specs = JSON.parse(String(logSpy.mock.calls.at(-1)?.[0])) as Array<{ command: string; example: string; writes: boolean }>
    expect(specs.find((s) => s.command.startsWith('config disable'))?.writes).toBe(true)
    expect(specs.find((s) => s.command.startsWith('config path'))?.writes).toBe(false)
    // doctor can write (via --fix) so it is flagged writes:true; its example is the read-only default
    const doctor = specs.find((s) => s.command === 'doctor')
    expect(doctor?.writes).toBe(true)
    expect(doctor?.example).toBe('mmr doctor')
    // every spec has a runnable example
    expect(specs.every((s) => s.example.startsWith('mmr '))).toBe(true)
  })

  it('--format json also works (equivalent to --json)', async () => {
    const { commandsCommand } = await import('../../src/commands/commands.js')
    await commandsCommand.handler({ format: 'json', _: ['commands'], $0: 'mmr' } as never)
    expect(() => JSON.parse(String(logSpy.mock.calls.at(-1)?.[0]))).not.toThrow()
  })

  it('prints a human table by default', async () => {
    const { commandsCommand } = await import('../../src/commands/commands.js')
    await commandsCommand.handler({ format: 'text', _: ['commands'], $0: 'mmr' } as never)
    const out = logSpy.mock.calls.map((c) => String(c[0])).join('\n')
    expect(out).toMatch(/config disable <channel>/)
    expect(out).toMatch(/doctor/)
  })
})
