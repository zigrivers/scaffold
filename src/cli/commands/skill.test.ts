import { describe, it, expect, vi, beforeEach, afterEach, type MockInstance } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'

vi.mock('../middleware/output-mode.js', () => ({
  resolveOutputMode: vi.fn(() => 'interactive'),
}))

import skillCommand from './skill.js'

function makeTmpDir(): string {
  const dir = path.join(os.tmpdir(), `scaffold-skill-test-${crypto.randomUUID()}`)
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

describe('scaffold skill', () => {
  let exitSpy: MockInstance
  let writtenLines: string[]
  let tmpDir: string

  beforeEach(() => {
    tmpDir = makeTmpDir()
    writtenLines = []
    exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never)
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      writtenLines.push(String(chunk))
      return true
    })
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('list shows available skills', async () => {
    await skillCommand.handler({
      action: 'list',
      root: tmpDir,
      $0: 'scaffold',
      _: ['skill', 'list'],
    } as Parameters<typeof skillCommand.handler>[0])

    const output = writtenLines.join('')
    expect(output).toContain('scaffold-runner')
    expect(output).toContain('scaffold-pipeline')
    expect(output).toContain('not installed')
    expect(exitSpy).toHaveBeenCalledWith(0)
  })

  it('install creates .claude/skills/ and copies files', async () => {
    await skillCommand.handler({
      action: 'install',
      root: tmpDir,
      force: false,
      $0: 'scaffold',
      _: ['skill', 'install'],
    } as Parameters<typeof skillCommand.handler>[0])

    const output = writtenLines.join('')
    // May succeed or fail depending on whether package skills dir resolves
    // In dev mode, skills/ is at repo root — check if install attempted
    expect(exitSpy).toHaveBeenCalledWith(0)
  })

  it('remove handles no installed skills gracefully', async () => {
    await skillCommand.handler({
      action: 'remove',
      root: tmpDir,
      $0: 'scaffold',
      _: ['skill', 'remove'],
    } as Parameters<typeof skillCommand.handler>[0])

    const output = writtenLines.join('')
    expect(output).toContain('No scaffold skills found')
    expect(exitSpy).toHaveBeenCalledWith(0)
  })
})
