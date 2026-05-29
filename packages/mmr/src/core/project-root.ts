import fs from 'node:fs'
import path from 'node:path'

/**
 * Resolve the project root by walking up from `start` until a `.git` entry
 * (the repository root) is found. Falls back to `start` when none is found, so
 * resolution degrades to the current directory rather than failing.
 *
 * This lets project-scoped lookups (e.g. ./.mmr/acks) work when a command is
 * invoked from a subdirectory, instead of resolving relative to process.cwd().
 */
export function findProjectRoot(start: string = process.cwd()): string {
  const origin = path.resolve(start)
  let dir = origin
  for (;;) {
    if (fs.existsSync(path.join(dir, '.git'))) return dir
    const parent = path.dirname(dir)
    if (parent === dir) return origin
    dir = parent
  }
}
