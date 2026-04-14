import fs from 'node:fs'
import path from 'node:path'

/**
 * Resolve an artifact path and verify it stays within the project root.
 *
 * Returns the canonicalized (symlink-resolved) absolute path if the target
 * stays inside `projectRoot`. Returns `null` if:
 *   - `relPath` is not a non-empty string, or contains a null byte
 *   - the project root does not exist
 *   - the resolved target escapes the project root
 *   - a symlink anywhere in the path chain (including above a missing leaf)
 *     points outside the project root
 *   - any fs error other than ENOENT/ENOTDIR surfaces during canonicalization
 *     (EACCES, ELOOP, EINVAL, …) — we fail closed rather than guess
 *
 * TOCTOU note: callers MUST use the returned absolute path for all
 * subsequent fs operations. Re-resolving `relPath` after this function
 * returns reintroduces the race window between canonicalization and use.
 */
export function resolveContainedArtifactPath(
  projectRoot: string,
  relPath: string,
): string | null {
  // State is JSON-loaded with a trust-cast, so `relPath` may be any type at
  // runtime. Reject non-strings, empty strings (would resolve to the project
  // root itself — never a legitimate artifact), and null-byte injections.
  if (typeof relPath !== 'string' || relPath === '' || relPath.includes('\0')) {
    return null
  }

  const resolved = path.resolve(projectRoot, relPath)

  let canonicalRoot: string
  try {
    canonicalRoot = fs.realpathSync(projectRoot)
  } catch {
    return null
  }

  const canonicalPath = canonicalizeWithMissingTail(resolved)
  if (canonicalPath === null) return null

  if (!isContained(canonicalPath, canonicalRoot)) return null
  // Reject root-equivalent inputs ('.', './', an absolute path equal to the
  // root, etc.). Callers never legitimately ask for the project root itself
  // as an artifact, and accepting it would let existence-only call sites
  // count the project root directory as a present artifact.
  if (canonicalPath === canonicalRoot) return null
  return canonicalPath
}

/**
 * Canonicalize a path whose leaf may not exist. Walk up until an ancestor
 * exists, `realpathSync` it, then re-append the missing tail. This defeats
 * symlink escape through intermediate directories even when the leaf is
 * absent — a plain string-prefix check on the unresolved `path.resolve`
 * output would miss this.
 *
 * Only climbs past ENOENT/ENOTDIR (genuine "does not exist" conditions).
 * Any other errno (EACCES, ELOOP, EINVAL, Windows UNC/drive failures, …)
 * returns null — we must not silently walk past a permission-denied
 * ancestor and reach a canonical root that trivially passes containment.
 */
function canonicalizeWithMissingTail(target: string): string | null {
  let head = target
  const tail: string[] = []
  while (true) {
    try {
      const canonicalHead = fs.realpathSync(head)
      return tail.length === 0 ? canonicalHead : path.join(canonicalHead, ...tail)
    } catch (err) {
      const code = err instanceof Error ? (err as NodeJS.ErrnoException).code : undefined
      if (code !== 'ENOENT' && code !== 'ENOTDIR') return null
      const parent = path.dirname(head)
      if (parent === head) return null
      tail.unshift(path.basename(head))
      head = parent
    }
  }
}

function isContained(candidate: string, root: string): boolean {
  // `path.relative` normalizes the comparison across platforms (POSIX `/`,
  // Windows drive roots, UNC shares) and naturally defeats both prefix
  // collision (`/project` vs `/project-malicious` → `../project-malicious/…`)
  // and root-slash edge cases (`/` + `path.sep` = `//`, which a manual
  // `startsWith` check would mishandle).
  const rel = path.relative(root, candidate)
  if (rel === '') return true // candidate === root
  if (rel === '..' || rel.startsWith('..' + path.sep)) return false
  if (path.isAbsolute(rel)) return false // different Windows drive
  return true
}
