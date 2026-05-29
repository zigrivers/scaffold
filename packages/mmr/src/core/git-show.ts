import { execFileSync } from 'node:child_process'

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
 * The ref is expected to be pre-validated by the caller (see trust-mode's
 * safe-refname allow-list); this helper does not itself sanitize the ref.
 */
export function readFileAtRef(opts: ReadFileAtRefOptions): string | undefined {
  const cleanedPath = opts.filePath.replace(/^\.\//, '')
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
