import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ensureIdentity, readIdentity, identityPath } from './identity.js'

describe('identity', () => {
  let dir: string

  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'observe-id-')) })
  afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

  it('creates .scaffold/identity.json with a UUID and the given label when missing', () => {
    const id = ensureIdentity(dir, 'agent-alice')
    expect(id.worktree_label).toBe('agent-alice')
    expect(id.worktree_id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    expect(existsSync(identityPath(dir))).toBe(true)
    const written = JSON.parse(readFileSync(identityPath(dir), 'utf8'))
    expect(written.worktree_id).toBe(id.worktree_id)
    expect(written.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('does not overwrite an existing identity file', () => {
    const first = ensureIdentity(dir, 'agent-alice')
    const second = ensureIdentity(dir, 'something-else')
    expect(second.worktree_id).toBe(first.worktree_id)
    expect(second.worktree_label).toBe(first.worktree_label)
  })

  it('readIdentity returns null when the file does not exist', () => {
    expect(readIdentity(dir)).toBeNull()
  })
})
