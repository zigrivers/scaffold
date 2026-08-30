import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  REVIEW_REMINDER_COMMAND, SETTINGS_PATH,
  applyHookPlan, installHooks, planHooks,
  type ClaudeSettings,
} from './install.js'

function project(opts: {
  beads?: boolean
  bdGuard?: boolean
  mqGuard?: boolean
  settings?: unknown
} = {}): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hooks-install-'))
  if (opts.beads === true) fs.mkdirSync(path.join(root, '.beads'))
  fs.mkdirSync(path.join(root, 'scripts'), { recursive: true })
  if (opts.bdGuard === true) {
    fs.writeFileSync(path.join(root, 'scripts', 'bd-guard.sh'), '#!/bin/bash\n', { mode: 0o755 })
  }
  if (opts.mqGuard === true) {
    fs.writeFileSync(path.join(root, 'scripts', 'mq-guard.sh'), '#!/bin/bash\n', { mode: 0o755 })
  }
  if (opts.settings !== undefined) {
    fs.mkdirSync(path.join(root, '.claude'), { recursive: true })
    fs.writeFileSync(
      path.join(root, '.claude', 'settings.json'),
      typeof opts.settings === 'string' ? opts.settings : JSON.stringify(opts.settings, null, 2),
    )
  }
  return root
}

function readBack(root: string): ClaudeSettings {
  return JSON.parse(fs.readFileSync(path.join(root, SETTINGS_PATH), 'utf8')) as ClaudeSettings
}

describe('installHooks (D8)', () => {
  it('registers all four hooks on a fully-provisioned project and creates the file', () => {
    const root = project({ beads: true, bdGuard: true, mqGuard: true })
    const res = installHooks(root)
    expect(res.added).toHaveLength(4)
    expect(res.skipped).toEqual([])
    expect(res.changed).toBe(true)
    const s = readBack(root)
    expect(s.hooks?.SessionStart?.[0].hooks[0].command).toBe('bd prime --hook-json')
    const preCommands = (s.hooks?.PreToolUse ?? []).map(e => e.hooks[0].command)
    expect(preCommands).toEqual(['scripts/bd-guard.sh', 'scripts/mq-guard.sh'])
    expect((s.hooks?.PreToolUse ?? []).every(e => e.matcher === 'Bash')).toBe(true)
    expect(s.hooks?.PostToolUse?.[0].hooks[0].command).toBe(REVIEW_REMINDER_COMMAND)
    expect(REVIEW_REMINDER_COMMAND).toContain('maximum 3 rounds per bounded cycle')
    expect(REVIEW_REMINDER_COMMAND).toContain('new exact head')
    expect(REVIEW_REMINDER_COMMAND).not.toContain('owner approval')
  })
  it('is idempotent — the second run changes nothing', () => {
    const root = project({ beads: true, bdGuard: true, mqGuard: true })
    installHooks(root)
    const before = fs.readFileSync(path.join(root, SETTINGS_PATH), 'utf8')
    const res = installHooks(root)
    expect(res.changed).toBe(false)
    expect(res.added).toEqual([])
    expect(res.alreadyPresent).toHaveLength(4)
    expect(fs.readFileSync(path.join(root, SETTINGS_PATH), 'utf8')).toBe(before)
  })
  it('preserves pre-existing user hooks and unrelated settings keys (jq-parity)', () => {
    const userHook = { matcher: 'Bash', hooks: [{ type: 'command', command: 'scripts/my-custom-hook.sh' }] }
    const root = project({
      beads: true, bdGuard: true, mqGuard: true,
      settings: {
        permissions: { allow: ['Bash(npm:*)'] },
        hooks: {
          PreToolUse: [userHook],
          Stop: [{ hooks: [{ type: 'command', command: 'echo done' }] }],
        },
      },
    })
    installHooks(root)
    const s = readBack(root)
    expect(s['permissions']).toEqual({ allow: ['Bash(npm:*)'] })
    expect(s.hooks?.Stop?.[0].hooks[0].command).toBe('echo done')
    const preCommands = (s.hooks?.PreToolUse ?? []).map(e => e.hooks[0].command)
    expect(preCommands[0]).toBe('scripts/my-custom-hook.sh') // appended after, never replaced
    expect(preCommands).toContain('scripts/bd-guard.sh')
    expect(preCommands).toContain('scripts/mq-guard.sh')
  })
  it('detects an equivalent gh pr create reminder (automated-pr-review variant) by marker', () => {
    const root = project({
      settings: {
        hooks: {
          PostToolUse: [{
            matcher: 'Bash',
            hooks: [{
              type: 'command',
              command: 'jq -r \'.tool_input.command // empty\' | grep -q \'gh pr create\' '
                + '&& echo \'REVIEW REQUIRED\' || true',
            }],
          }],
        },
      },
    })
    const res = installHooks(root)
    expect(res.alreadyPresent).toEqual(['PostToolUse: gh pr create review reminder (mmr review)'])
    expect(readBack(root).hooks?.PostToolUse).toHaveLength(1)
  })
  it('reports every skipped hook with its missing prerequisite (no silent no-op)', () => {
    const root = project({}) // no .beads, no guard scripts
    const res = installHooks(root)
    expect(res.added).toHaveLength(1) // only the reminder has no prerequisite
    expect(res.skipped).toHaveLength(3)
    const reasons = res.skipped.map(s => s.reason).join('\n')
    expect(reasons).toMatch(/\.beads\/ not found/)
    expect(reasons).toMatch(/mq-guard\.sh missing or not executable/)
  })
  it('bd-guard requires the script to be EXECUTABLE, mirroring the old [ -x ] gate', () => {
    const root = project({ beads: true })
    fs.writeFileSync(path.join(root, 'scripts', 'bd-guard.sh'), '#!/bin/bash\n', { mode: 0o644 })
    const res = installHooks(root)
    expect(res.skipped.map(s => s.reason).join('\n')).toMatch(/bd-guard\.sh missing or not executable/)
  })
  it('refuses to touch a malformed settings.json (never clobber)', () => {
    const root = project({ beads: true, bdGuard: true, settings: '{ not json' })
    expect(() => installHooks(root)).toThrow()
    expect(fs.readFileSync(path.join(root, SETTINGS_PATH), 'utf8')).toBe('{ not json')
  })
  it('refuses to touch a valid-JSON-but-non-object settings.json (null/array)', () => {
    for (const content of ['null', '[]', '42']) {
      const root = project({ beads: true, bdGuard: true, settings: content })
      expect(() => installHooks(root)).toThrow(/not a JSON object/)
      expect(fs.readFileSync(path.join(root, SETTINGS_PATH), 'utf8')).toBe(content)
    }
  })
  it('writes atomically — no temp file left behind', () => {
    const root = project({ mqGuard: true })
    installHooks(root)
    expect(fs.readdirSync(path.join(root, '.claude'))).toEqual(['settings.json'])
  })
})

describe('planHooks / applyHookPlan (pure halves — reused read-only by the adopt plan preview)', () => {
  it('planHooks never mutates its inputs', () => {
    const root = project({ mqGuard: true })
    const settings: ClaudeSettings = { hooks: { PreToolUse: [] } }
    const snapshot = JSON.stringify(settings)
    planHooks(root, settings)
    expect(JSON.stringify(settings)).toBe(snapshot)
  })
  it('applyHookPlan returns a new object and leaves the input untouched', () => {
    const root = project({ mqGuard: true })
    const settings: ClaudeSettings = {}
    const next = applyHookPlan(settings, planHooks(root, settings))
    expect(settings.hooks).toBeUndefined()
    expect(next.hooks?.PreToolUse?.[0].hooks[0].command).toBe('scripts/mq-guard.sh')
  })
})
