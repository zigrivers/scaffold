import { describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { hooksHandler } from './hooks.js'

function tmpRoot(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'hooks-cli-'))
}

describe('scaffold hooks', () => {
  it('install runs the D8 primitive and exits 0', async () => {
    const root = tmpRoot()
    await hooksHandler({ action: 'install', root }, {
      install: () => ({
        added: ['PostToolUse: gh pr create review reminder (mmr review)'],
        alreadyPresent: [],
        skipped: [],
        settingsPath: path.join(root, '.claude/settings.json'),
        changed: true,
      }),
    })
    expect(process.exitCode ?? 0).toBe(0)
    process.exitCode = 0
  })
  it('prints distinct report lines per result type and stays exit 0 on skips-only', async () => {
    const out: string[] = []
    const spyOut = vi.spyOn(process.stdout, 'write').mockImplementation((c) => { out.push(String(c)); return true })
    const spyErr = vi.spyOn(process.stderr, 'write').mockImplementation((c) => { out.push(String(c)); return true })
    const root = tmpRoot()
    await hooksHandler({ action: 'install', root }, {
      install: () => ({
        added: ['PostToolUse: gh pr create review reminder'],
        alreadyPresent: ['PreToolUse: bd-guard.sh'],
        skipped: [{ hook: 'SessionStart bd prime', reason: '.beads/ not found' }],
        settingsPath: path.join(root, '.claude/settings.json'),
        changed: true,
      }),
    })
    const text = out.join('')
    expect(text).toContain('registered PostToolUse: gh pr create review reminder')
    expect(text).toContain('already registered PreToolUse: bd-guard.sh')
    expect(text).toContain('.beads/ not found')
    expect(process.exitCode ?? 0).toBe(0) // skipped-only is not an error
    spyOut.mockRestore(); spyErr.mockRestore(); process.exitCode = 0
  })
  it('surfaces install errors (malformed settings.json) with exit 1', async () => {
    await hooksHandler({ action: 'install', root: tmpRoot() }, {
      install: () => {
        throw new Error('.claude/settings.json is not a JSON object — refusing to modify it')
      },
    })
    expect(process.exitCode).toBe(1)
    process.exitCode = 0
  })
  it('rejects unknown actions', async () => {
    await hooksHandler({ action: 'status', root: tmpRoot() })
    expect(process.exitCode).toBe(1)
    process.exitCode = 0
  })
  it('end-to-end: registers the reminder hook into a real settings file', async () => {
    const root = tmpRoot()
    await hooksHandler({ action: 'install', root })
    const settings = JSON.parse(
      fs.readFileSync(path.join(root, '.claude', 'settings.json'), 'utf8'),
    ) as { hooks: { PostToolUse: unknown[] } }
    expect(JSON.stringify(settings.hooks.PostToolUse)).toContain('gh pr create')
    expect(process.exitCode ?? 0).toBe(0)
    process.exitCode = 0
  })
})
