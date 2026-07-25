import { describe, expect, it } from 'vitest'
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
