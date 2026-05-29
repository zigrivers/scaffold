import { execFileSync } from 'node:child_process'

// Conservative git refname allow-list: letters, digits, . _ - / and the safe
// relative-rev modifiers ~ ^. Rejects the constructs that could smuggle
// surprising rev/path syntax into `git show <ref>:<path>` — ':' (the rev:path
// separator), '..' (ranges), '@{' (reflog), and leading '-'/'/'.
const SAFE_REF_RE = /^[A-Za-z0-9._/~^-]+$/

/** Whether a git ref is safe to embed in `git show <ref>:<path>`. */
export function isSafeRef(ref: string): boolean {
  return (
    SAFE_REF_RE.test(ref) &&
    !ref.includes('..') &&
    !ref.includes('@{') &&
    !ref.startsWith('-') &&
    !ref.startsWith('/') &&
    !ref.endsWith('/')
  )
}

/** Whether a repo-relative path is safe (no rev separator, no traversal). */
function isSafePath(p: string): boolean {
  if (p.length === 0 || p.includes(':')) return false
  return !p.split('/').includes('..')
}

export interface ReadFileAtRefOptions {
  cwd: string
  ref: string
  /** Path relative to the repo root, with leading `./` allowed. */
  filePath: string
}

/**
 * Read file contents at a specific Git ref via `git show <ref>:<path>`.
 * Returns `undefined` when the ref or the path does not exist at the ref.
 * Never throws; callers must handle the undefined-fallback case.
 *
 * Fails closed (returns undefined) on an unsafe ref or path rather than
 * trusting callers to pre-validate — this is the §5-decision-1 trust boundary,
 * so the guard lives at the boundary itself.
 */
export function readFileAtRef(opts: ReadFileAtRefOptions): string | undefined {
  const cleanedPath = opts.filePath.replace(/^\.\//, '')
  if (!isSafeRef(opts.ref) || !isSafePath(cleanedPath)) return undefined
  try {
    return execFileSync('git', ['-C', opts.cwd, 'show', `${opts.ref}:${cleanedPath}`], {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
      maxBuffer: 10 * 1024 * 1024,
      timeout: 10000,
    })
  } catch {
    return undefined
  }
}

export interface ListFilesAtRefOptions {
  cwd: string
  ref: string
  /** Repo-relative directory to list, with leading `./` allowed. */
  dirPath: string
}

/**
 * List the file paths (repo-root-relative) under a directory at a Git ref via
 * `git ls-tree`. Returns `[]` on an unsafe ref/path, a missing ref/dir, or any
 * git error. Never throws.
 */
export function listFilesAtRef(opts: ListFilesAtRefOptions): string[] {
  const cleaned = opts.dirPath.replace(/^\.\//, '').replace(/\/$/, '')
  if (!isSafeRef(opts.ref) || !isSafePath(cleaned)) return []
  try {
    const out = execFileSync('git', ['-C', opts.cwd, 'ls-tree', '--name-only', opts.ref, '--', `${cleaned}/`], {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
      maxBuffer: 10 * 1024 * 1024,
      timeout: 10000,
    })
    return out
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
  } catch {
    return []
  }
}
