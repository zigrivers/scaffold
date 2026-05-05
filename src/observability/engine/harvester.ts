import { access, copyFile, mkdir, rename, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { lock } from 'proper-lockfile'
import { readIdentity } from './identity.js'
import { ledgerPath } from './ledger-writer.js'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export interface HarvestInput {
  primaryRoot: string
  worktreeRoot: string
}

export function archiveDir(primaryRoot: string): string {
  return join(primaryRoot, '.scaffold', 'activity-archive')
}

export function activeArchiveFile(primaryRoot: string, worktreeId: string): string {
  return join(archiveDir(primaryRoot), 'active', `${worktreeId}.jsonl`)
}

export async function harvestWorktree(input: HarvestInput): Promise<void> {
  const sourceLedger = ledgerPath(input.worktreeRoot)
  try {
    await access(sourceLedger)
  } catch {
    return
  }

  const id = readIdentity(input.worktreeRoot)
  if (!id) {
    throw new Error(`worktree at ${input.worktreeRoot} has no .scaffold/identity.json`)
  }

  // UUID validation prevents path traversal via a crafted identity file.
  if (!UUID_RE.test(id.worktree_id)) {
    throw new Error(`invalid worktree_id format: ${id.worktree_id}`)
  }

  const dest = activeArchiveFile(input.primaryRoot, id.worktree_id)
  await mkdir(join(archiveDir(input.primaryRoot), 'active'), { recursive: true })

  // Hold the same lock as writeEvent for a consistent (non-torn) snapshot.
  const release = await lock(sourceLedger, {
    retries: { retries: 10, factor: 1.5, minTimeout: 50, maxTimeout: 500 },
    stale: 30_000,
  })
  const tmp = `${dest}.tmp.${process.pid}.${Date.now()}`
  try {
    await copyFile(sourceLedger, tmp)
  } finally {
    await release()
  }

  // Rename outside the lock — only the source needs protection during the copy.
  try {
    await rename(tmp, dest)
  } catch (err) {
    try { await unlink(tmp) } catch { /* ignore */ }
    throw err
  }
}
