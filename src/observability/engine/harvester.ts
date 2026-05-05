import { copyFileSync, existsSync, mkdirSync, renameSync } from 'node:fs'
import { join } from 'node:path'
import { readIdentity } from './identity.js'
import { ledgerPath } from './ledger-writer.js'

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
  if (!existsSync(sourceLedger)) return

  const id = readIdentity(input.worktreeRoot)
  if (!id) {
    throw new Error(`worktree at ${input.worktreeRoot} has no .scaffold/identity.json`)
  }

  const dest = activeArchiveFile(input.primaryRoot, id.worktree_id)
  mkdirSync(join(archiveDir(input.primaryRoot), 'active'), { recursive: true })

  // Write to a temp file then rename for atomic replacement.
  const tmp = `${dest}.tmp.${process.pid}.${Date.now()}`
  copyFileSync(sourceLedger, tmp)
  renameSync(tmp, dest)
}
