import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { describe, it, expect, afterEach } from 'vitest'
import { resolveContainedArtifactPath } from './artifact-path.js'

const tmpDirs: string[] = []

function tmpRoot() {
  const p = path.join(os.tmpdir(), `scaffold-test-${crypto.randomUUID()}`)
  fs.mkdirSync(p, { recursive: true })
  tmpDirs.push(p)
  return p
}

afterEach(() => {
  for (const d of tmpDirs) {
    try { fs.rmSync(d, { recursive: true, force: true }) } catch { /* ignore */ }
  }
  tmpDirs.length = 0
})

describe('resolveContainedArtifactPath', () => {
  it('resolves a normal relative path inside the project root', () => {
    const root = tmpRoot()
    const docs = path.join(root, 'docs')
    fs.mkdirSync(docs, { recursive: true })
    fs.writeFileSync(path.join(docs, 'plan.md'), 'x')

    const resolved = resolveContainedArtifactPath(root, 'docs/plan.md')

    expect(resolved).not.toBeNull()
    expect(resolved).toBe(fs.realpathSync(path.join(docs, 'plan.md')))
  })

  it('returns null for a traversal attempt via ..', () => {
    const root = tmpRoot()
    fs.mkdirSync(path.join(root, 'docs'), { recursive: true })

    const resolved = resolveContainedArtifactPath(root, '../../etc/passwd')

    expect(resolved).toBeNull()
  })

  it('returns null when a symlink escapes the project root (existing leaf)', () => {
    const root = tmpRoot()
    const outside = tmpRoot()
    fs.writeFileSync(path.join(outside, 'secret.txt'), 'nope')
    fs.mkdirSync(path.join(root, 'docs'), { recursive: true })
    fs.symlinkSync(outside, path.join(root, 'docs', 'escape'))

    const resolved = resolveContainedArtifactPath(root, 'docs/escape/secret.txt')

    expect(resolved).toBeNull()
  })

  it('returns null when a symlinked ancestor escapes and the leaf does NOT exist', () => {
    // Critical case: the leaf is missing, but an ancestor in the chain is a
    // symlink that points outside the project root. A naive ENOENT fallback
    // that only does string-prefix checks would accept this. The helper must
    // canonicalize the deepest existing ancestor and reject.

    const root = tmpRoot()
    const outside = tmpRoot()
    fs.mkdirSync(path.join(root, 'docs'), { recursive: true })
    fs.symlinkSync(outside, path.join(root, 'docs', 'escape'))

    const resolved = resolveContainedArtifactPath(root, 'docs/escape/missing.txt')

    expect(resolved).toBeNull()
  })

  it('returns null on prefix collision (project vs project-malicious)', () => {
    const parent = tmpRoot()
    const project = path.join(parent, 'project')
    const malicious = path.join(parent, 'project-malicious')
    fs.mkdirSync(project, { recursive: true })
    fs.mkdirSync(malicious, { recursive: true })
    fs.writeFileSync(path.join(malicious, 'secret.txt'), 'nope')

    const resolved = resolveContainedArtifactPath(project, '../project-malicious/secret.txt')

    expect(resolved).toBeNull()
  })

  it('returns the canonical path for a file that does not yet exist', () => {
    // Pre-completion checks pass a path whose file does not exist yet. The
    // helper must NOT reject these — it must return a canonical would-be path
    // after verifying the deepest existing ancestor stays within the root.

    const root = tmpRoot()
    fs.mkdirSync(path.join(root, 'docs'), { recursive: true })
    const canonicalRoot = fs.realpathSync(root)

    const resolved = resolveContainedArtifactPath(root, 'docs/not-yet.md')

    expect(resolved).toBe(path.join(canonicalRoot, 'docs', 'not-yet.md'))
  })

  it('returns a canonical path when the project root itself is a symlink', () => {
    // macOS tmpdir is /var/folders/... which is a symlink to /private/var/... —
    // this test makes the behavior explicit regardless of platform.

    const realParent = tmpRoot()
    const realRoot = path.join(realParent, 'real-proj')
    fs.mkdirSync(realRoot, { recursive: true })
    const symlinkedRoot = path.join(tmpRoot(), 'via-symlink')
    fs.symlinkSync(realRoot, symlinkedRoot)

    const resolved = resolveContainedArtifactPath(symlinkedRoot, 'docs/not-yet.md')

    expect(resolved).toBe(path.join(fs.realpathSync(symlinkedRoot), 'docs', 'not-yet.md'))
  })

  it('returns null when the file does not exist AND the path would escape', () => {
    const root = tmpRoot()

    const resolved = resolveContainedArtifactPath(root, '../../does-not-exist')

    expect(resolved).toBeNull()
  })

  it('returns null when relPath is absolute and points outside the root', () => {
    // path.resolve(root, '/etc/passwd') === '/etc/passwd' — the root arg is
    // ignored when the second arg is absolute. This is the single most
    // important attack vector for a poisoned state.json with an absolute
    // `produces` entry.

    const root = tmpRoot()

    const resolved = resolveContainedArtifactPath(root, '/etc/passwd')

    expect(resolved).toBeNull()
  })

  it('returns null for relPath containing a null byte', () => {
    // fs APIs throw on null bytes; reject them at the boundary rather than
    // leaking undefined behavior to callers.

    const root = tmpRoot()

    const resolved = resolveContainedArtifactPath(root, 'docs/foo\0.md')

    expect(resolved).toBeNull()
  })

  it('returns null when the project root itself does not exist', () => {
    const nonexistent = path.join(os.tmpdir(), `scaffold-test-${crypto.randomUUID()}`)

    const resolved = resolveContainedArtifactPath(nonexistent, 'docs/plan.md')

    expect(resolved).toBeNull()
  })

  it('rejects any relPath that resolves to the project root itself', () => {
    // The project root directory is not a legitimate artifact. Empty
    // string, '.', './', and an absolute path to the root all resolve
    // to projectRoot and must all fail — otherwise existence-only
    // callers (detectCompletion, checkCompletion, analyzeCrash) would
    // count the project root directory as a present artifact.
    const root = tmpRoot()

    expect(resolveContainedArtifactPath(root, '')).toBeNull()
    expect(resolveContainedArtifactPath(root, '.')).toBeNull()
    expect(resolveContainedArtifactPath(root, './')).toBeNull()
    expect(resolveContainedArtifactPath(root, root)).toBeNull()
    expect(resolveContainedArtifactPath(root, fs.realpathSync(root))).toBeNull()
  })

  it('rejects non-string relPath (state boundary is untrusted)', () => {
    // State is JSON-loaded via a trust-cast; a poisoned state.json could
    // put a non-string in produces[]. Fail closed.
    const root = tmpRoot()

    const resolved = resolveContainedArtifactPath(root, 42 as unknown as string)

    expect(resolved).toBeNull()
  })
})
