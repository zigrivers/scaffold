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

  let prevMmrHome: string | undefined

  beforeEach(() => {
    prevCwd = process.cwd()
    prevHome = process.env.HOME
    prevMmrHome = process.env.MMR_HOME
    delete process.env.MMR_HOME
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
    if (prevMmrHome === undefined) delete process.env.MMR_HOME
    else process.env.MMR_HOME = prevMmrHome
    fs.rmSync(project, { recursive: true, force: true })
    fs.rmSync(home, { recursive: true, force: true })
  })

  it('assembles the critique prompt without dispatching', async () => {
    const artifact = path.join(project, 'design.md')
    fs.writeFileSync(artifact, '# Notifications\nPoll a status table every 30 seconds from the client.')
    const { critiqueCommand } = await import('../../src/commands/critique.js')
    // --trust-project-config so the working-tree .mmr.yaml (with the fake channel)
    // is honored in this non-git temp dir; dry-run must not spawn any subprocess.
    await critiqueCommand.handler({
      input: artifact, 'dry-run': true, trustProjectConfig: true, _: ['critique'], $0: 'mmr',
    } as never)
    const out = logSpy.mock.calls.map((c) => String(c[0])).join('\n')
    expect(out).toContain('DRY RUN')
    expect(out).toContain('fake')
    // the assembled prompt carries the design-critique framing + the artifact
    expect(out.toLowerCase()).toContain('design critique')
    expect(out).toContain('Poll a status table every 30 seconds')
  })

  it('grounds the prompt in the repo with --context repo', async () => {
    fs.writeFileSync(path.join(project, 'package.json'), '{"name":"ground-demo"}')
    const artifact = path.join(project, 'design.md')
    fs.writeFileSync(artifact, '# Notifications\nPoll every 30s.')
    const { critiqueCommand } = await import('../../src/commands/critique.js')
    await critiqueCommand.handler({
      input: artifact, 'dry-run': true, trustProjectConfig: true, context: 'repo',
      _: ['critique'], $0: 'mmr',
    } as never)
    const out = logSpy.mock.calls.map((c) => String(c[0])).join('\n')
    expect(out).toContain('Repository context')
    expect(out).toContain('ground-demo') // package.json was folded in
  })

  it('applies a persona lens to the channel prompt with --lenses', async () => {
    const artifact = path.join(project, 'design.md')
    fs.writeFileSync(artifact, '# D\nPoll every 30s.')
    const { critiqueCommand } = await import('../../src/commands/critique.js')
    await critiqueCommand.handler({
      input: artifact, 'dry-run': true, trustProjectConfig: true, lenses: 'skeptic',
      _: ['critique'], $0: 'mmr',
    } as never)
    const out = logSpy.mock.calls.map((c) => String(c[0])).join('\n')
    expect(out).toContain('Your lens')
    expect(out.toLowerCase()).toMatch(/skeptic|flawed/)
  })

  it('injects the prior round ledger on a --session re-run', async () => {
    const { CritiqueSessionStore, resolveCritiqueSessionRoot } = await import('../../src/core/critique-session.js')
    new CritiqueSessionStore(resolveCritiqueSessionRoot()).append('s1', {
      round: 1, artifact_source: 'design.md',
      items: [{ id: 'C-001', kind: 'concern', theme: 'scaling', observation: 'will not scale past 10k' }],
    })
    const artifact = path.join(project, 'design.md')
    fs.writeFileSync(artifact, '# D\nNow uses SSE.')
    const { critiqueCommand } = await import('../../src/commands/critique.js')
    await critiqueCommand.handler({
      input: artifact, 'dry-run': true, trustProjectConfig: true, session: 's1',
      _: ['critique'], $0: 'mmr',
    } as never)
    const out = logSpy.mock.calls.map((c) => String(c[0])).join('\n')
    expect(out).toContain('Previously raised (round 1)')
    expect(out).toContain('C-001')
  })
})

describe('mmr critique (yargs parsing)', () => {
  // These exercise the REAL yargs layer (the handler tests above bypass it),
  // catching parse regressions like the --no-synthesis negation conflict.
  async function parse(argv: string[]): Promise<Record<string, unknown>> {
    const yargs = (await import('yargs')).default
    const { critiqueCommand } = await import('../../src/commands/critique.js')
    let captured: Record<string, unknown> = {}
    await yargs(argv)
      .command({ ...critiqueCommand, handler: (a) => { captured = a as Record<string, unknown> } })
      .strict()
      .fail((msg) => { throw new Error(msg) })
      .parseAsync()
    return captured
  }

  it('parses --no-synthesis to synthesis:false without a strict-mode error', async () => {
    const args = await parse(['critique', 'design.md', '--no-synthesis', '--dry-run'])
    expect(args.synthesis).toBe(false)
  })

  it('defaults synthesis to true', async () => {
    const args = await parse(['critique', 'design.md', '--dry-run'])
    expect(args.synthesis).toBe(true)
  })

  it('parses --lenses (comma string) and --session', async () => {
    const args = await parse(['critique', 'design.md', '--lenses', 'skeptic,simplifier', '--session', 's1'])
    expect(args.lenses).toBe('skeptic,simplifier')
    expect(args.session).toBe('s1')
  })

  it('does not let --lenses swallow the positional input (greedy-array footgun)', async () => {
    // The whole point of the comma-string form: `--lenses skeptic design.md`
    // keeps design.md as the positional input instead of a second lens.
    const args = await parse(['critique', '--lenses', 'skeptic', 'design.md'])
    expect(args.lenses).toBe('skeptic')
    expect(args.input).toBe('design.md')
  })
})
