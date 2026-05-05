import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { WorktreeIdentity } from './types.js'

export function identityPath(worktreeRoot: string): string {
  return join(worktreeRoot, '.scaffold', 'identity.json')
}

export function readIdentity(worktreeRoot: string): WorktreeIdentity | null {
  const path = identityPath(worktreeRoot)
  if (!existsSync(path)) return null
  try {
    const data = JSON.parse(readFileSync(path, 'utf8')) as Partial<WorktreeIdentity>
    if (typeof data?.worktree_id !== 'string' || typeof data?.worktree_label !== 'string') return null
    return data as WorktreeIdentity
  } catch {
    return null
  }
}

export function ensureIdentity(worktreeRoot: string, label: string): WorktreeIdentity {
  const existing = readIdentity(worktreeRoot)
  if (existing) return existing
  const id: WorktreeIdentity = {
    worktree_id: randomUUID(),
    worktree_label: label,
    created_at: new Date().toISOString(),
  }
  mkdirSync(dirname(identityPath(worktreeRoot)), { recursive: true })
  writeFileSync(identityPath(worktreeRoot), JSON.stringify(id, null, 2) + '\n', { mode: 0o644 })
  return id
}
