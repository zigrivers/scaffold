import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

describe('mmr critique (dry-run)', () => {
  let project: string
  let home: string
  let prevCwd: string
  let prevHome: string | undefined
  let logSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    prevCwd = process.cwd()
    prevHome = process.env.HOME
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'crit-home-'))
    process.env.HOME = home
    project = fs.mkdtempSync(path.join(os.tmpdir(), 'crit-proj-'))
    // Only a `fake` echo channel is enabled; disable the install/auth-dependent builtins.
    fs.writeFileSync(path.join(project, '.mmr.yaml'), [
      'version: 1',
      'channels_disabled: [claude, codex, antigravity, grok, gemini, opencode, doc-conformance]',
      'channels:',
      '  fake:',
      '    kind: subprocess',
      '    command: echo',
      '    enabled: true',
      '',
    ].join('\n'))
    process.chdir(project)
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined)
  })

  afterEach(() => {
    logSpy.mockRestore()
    process.chdir(prevCwd)
    if (prevHome === undefined) delete process.env.HOME
    else process.env.HOME = prevHome
    fs.rmSync(project, { recursive: true, force: true })
    fs.rmSync(home, { recursive: true, force: true })
  })

  it('assembles the critique prompt without dispatching', async () => {
    const artifact = path.join(project, 'design.md')
    fs.writeFileSync(artifact, '# Notifications\nPoll a status table every 30 seconds from the client.')
    const { critiqueCommand } = await import('../../src/commands/critique.js')
    await critiqueCommand.handler({ input: artifact, 'dry-run': true, _: ['critique'], $0: 'mmr' } as never)
    const out = logSpy.mock.calls.map((c) => String(c[0])).join('\n')
    expect(out).toContain('DRY RUN')
    expect(out).toContain('fake')
    // the assembled prompt carries the design-critique framing + the artifact
    expect(out.toLowerCase()).toContain('design critique')
    expect(out).toContain('Poll a status table every 30 seconds')
  })
})
