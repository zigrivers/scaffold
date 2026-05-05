import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { v4 as uuidv4 } from 'uuid'
import type { WorktreeIdentity } from './types.js'

export function identityPath(worktreeRoot: string): string {
  return join(worktreeRoot, '.scaffold', 'identity.json')
}

export function readIdentity(worktreeRoot: string): WorktreeIdentity | null {
  const path = identityPath(worktreeRoot)
  if (!existsSync(path)) return null
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as WorktreeIdentity
  } catch {
    return null
  }
}

export function ensureIdentity(worktreeRoot: string, label: string): WorktreeIdentity {
  const existing = readIdentity(worktreeRoot)
  if (existing) return existing
  const id: WorktreeIdentity = {
    worktree_id: uuidv4(),
    worktree_label: label,
    created_at: new Date().toISOString(),
  }
  mkdirSync(join(worktreeRoot, '.scaffold'), { recursive: true })
  writeFileSync(identityPath(worktreeRoot), JSON.stringify(id, null, 2) + '\n', { mode: 0o644 })
  return id
}
