import { access, appendFile, copyFile, mkdir, readFile, readdir, rename, rm, stat, unlink } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { lock } from 'proper-lockfile'
import { readIdentityAsync } from './identity.js'
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

  const id = await readIdentityAsync(input.worktreeRoot)
  if (!id) {
    throw new Error(`worktree at ${input.worktreeRoot} has no .scaffold/identity.json`)
  }

  // UUID validation prevents path traversal via a crafted identity file.
  if (!UUID_RE.test(id.worktree_id)) {
    throw new Error(`invalid worktree_id format: ${id.worktree_id}`)
  }

  const dest = activeArchiveFile(input.primaryRoot, id.worktree_id)
  await mkdir(join(archiveDir(input.primaryRoot), 'active'), { recursive: true })

  // Hold the same lock as writeEvent for a consistent snapshot.
  // rename is inside the lock scope so a slower concurrent harvester cannot
  // overwrite a newer archive produced by a faster one.
  const release = await lock(sourceLedger, {
    retries: { retries: 10, factor: 1.5, minTimeout: 50, maxTimeout: 500 },
    stale: 30_000,
  })
  const tmp = `${dest}.tmp.${randomUUID()}`
  try {
    await copyFile(sourceLedger, tmp)
    await rename(tmp, dest)
  } catch (err) {
    try { await unlink(tmp) } catch { /* tmp may not exist if copyFile never created it */ }
    throw err
  } finally {
    await release()
  }
}

// ─── recoverStaleArchives ─────────────────────────────────────────────────────

export interface RecoverInput {
  primaryRoot: string
  listWorktrees?: () => string[]
}
export interface RecoverResult {
  rotated: string[]
}

function defaultListWorktrees(primaryRoot: string): string[] {
  try {
    const out = execFileSync('git', ['worktree', 'list', '--porcelain'], { cwd: primaryRoot, encoding: 'utf8' })
    return out.split('\n').filter((l) => l.startsWith('worktree ')).map((l) => l.slice('worktree '.length).trim())
  } catch { return [] }
}

async function readWorktreeId(worktreePath: string): Promise<string | null> {
  const idPath = join(worktreePath, '.scaffold/identity.json')
  if (!existsSync(idPath)) return null
  try {
    const obj = JSON.parse(await readFile(idPath, 'utf8')) as { worktree_id?: string }
    return obj.worktree_id ?? null
  } catch { return null }
}

export async function recoverStaleArchives(input: RecoverInput): Promise<RecoverResult> {
  const activeDir = join(input.primaryRoot, '.scaffold/activity-archive/active')
  if (!existsSync(activeDir)) return { rotated: [] }

  const liveWorktrees = (input.listWorktrees ?? (() => defaultListWorktrees(input.primaryRoot)))()
  const liveIdPromises = liveWorktrees.map((wt) => readWorktreeId(wt))
  const liveIdResults = await Promise.all(liveIdPromises)
  const liveIds = new Set(liveIdResults.filter((id): id is string => id !== null))

  const rotated: string[] = []
  const files = await readdir(activeDir)
  for (const file of files) {
    if (!file.endsWith('.jsonl')) continue
    const wtId = basename(file, '.jsonl')
    if (liveIds.has(wtId)) continue

    const activeFile = join(activeDir, file)
    const fileStat = await stat(activeFile)
    const ym = fileStat.mtime.toISOString().slice(0, 7)
    const archiveFile = join(input.primaryRoot, `.scaffold/activity-archive/${ym}.jsonl`)
    await mkdir(join(input.primaryRoot, '.scaffold/activity-archive'), { recursive: true })
    const content = await readFile(activeFile, 'utf8')
    await appendFile(archiveFile, content, { mode: 0o644 })
    await rm(activeFile)
    rotated.push(wtId)
  }
  return { rotated }
}
