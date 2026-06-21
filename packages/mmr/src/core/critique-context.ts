import fs from 'node:fs'
import path from 'node:path'

export interface RepoContext {
  /** The assembled context blob to inject into the prompt. */
  context: string
  /** Repo-relative paths actually folded in (the "context used" disclosure). */
  used: string[]
}

export interface BuildContextOpts {
  cwd: string
  /** Agent/user-supplied paths (highest priority, D3). */
  explicitPaths?: string[]
  /** The artifact text — scanned for referenced file paths in skeleton mode. */
  artifact: string
  /** Max total characters of context (default 40000). */
  budgetChars?: number
}

const IGNORE_DIRS = new Set([
  '.git', 'node_modules', 'dist', 'build', 'coverage', '.next', '.cache', '.turbo',
  'target', 'vendor', '.venv', 'venv', '__pycache__', '.tox', 'out', '.gradle',
])
const MANIFESTS = [
  'package.json', 'tsconfig.json', 'pyproject.toml', 'go.mod', 'Cargo.toml', 'requirements.txt', 'Gemfile', 'pom.xml',
]
const MAX_FILE_BYTES = 64 * 1024
const TREE_CAP = 200
const TREE_WALK_CAP = TREE_CAP * 4

// Never read secret/credential files into the prompt — they'd be sent to every
// channel. A filename denylist (gitignore isn't necessarily present/parsed).
// All matching is case-insensitive and token-aware (so `credentials.json` and
// `aws-credentials` match, not just an exact `credentials`).
const SECRET_EXT = /\.(pem|key|pfx|p12|keystore|jks|asc|ppk)$/i
const SECRET_NAME_RE = new RegExp([
  '(^\\.env)',                                            // .env, .env.local, .env.production
  '(^\\.(npmrc|netrc|pgpass|htpasswd|git-credentials)$)', // dotfile credential stores
  '(^id_(rsa|dsa|ecdsa|ed25519))',                        // ssh private keys
  '((^|[._-])(secrets?|credentials?|passwd|password|token|apikey|api[._-]?key)([._-]|$))',
].join('|'), 'i')

function baseName(rel: string): string {
  return rel.split(/[/\\]/).pop() ?? ''
}

/** True for env files, private keys, and credential/secret-named files. */
function isSensitiveFile(rel: string): boolean {
  const base = baseName(rel).toLowerCase()
  return SECRET_EXT.test(base) || SECRET_NAME_RE.test(base)
}

/** True if any path segment names an ignored directory. */
function hasIgnoredSegment(rel: string): boolean {
  return rel.split(/[/\\]/).some((seg) => IGNORE_DIRS.has(seg))
}

/**
 * Resolve a repo-relative path, returning null if it escapes the repo root —
 * lexically AND after symlink resolution (a repo-local symlink can point
 * outside). Non-existent paths resolve to null (nothing to read).
 */
function resolveInside(cwd: string, rel: string): string | null {
  const abs = path.resolve(cwd, rel)
  const lexRel = path.relative(cwd, abs)
  if (lexRel === '' || lexRel.startsWith('..') || path.isAbsolute(lexRel)) return null
  try {
    const realCwd = fs.realpathSync(cwd)
    const realAbs = fs.realpathSync(abs)
    const realRel = path.relative(realCwd, realAbs)
    if (realRel.startsWith('..') || path.isAbsolute(realRel)) return null
  } catch {
    return null
  }
  return abs
}

/** Shallow file list (depth ≤ maxDepth), skipping ignored + symlinked entries. */
function walkTree(cwd: string, maxDepth = 3): string[] {
  const out: string[] = []
  const walk = (dir: string, depth: number): void => {
    if (depth > maxDepth) return
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (out.length >= TREE_WALK_CAP) return
      if (IGNORE_DIRS.has(entry.name)) continue
      const full = path.join(dir, entry.name)
      // isDirectory()/isFile() are false for symlinks, so they're skipped here.
      if (entry.isDirectory()) walk(full, depth + 1)
      else if (entry.isFile() && !isSensitiveFile(entry.name)) out.push(path.relative(cwd, full))
    }
  }
  walk(cwd, 1)
  return out.sort()
}

/** Read a text file, returning null if missing, oversized, or binary. */
function readTextFile(abs: string): string | null {
  try {
    const stat = fs.statSync(abs)
    if (!stat.isFile() || stat.size > MAX_FILE_BYTES) return null
    const content = fs.readFileSync(abs, 'utf-8')
    if (content.includes(String.fromCharCode(0))) return null // skip binaries
    return content
  } catch {
    return null
  }
}

/** Paths referenced in the artifact text that exist in the repo. */
function referencedPaths(cwd: string, artifact: string): string[] {
  const matches = artifact.match(/[\w./-]+\.\w+/g) ?? []
  const out: string[] = []
  for (const m of matches) {
    const rel = m.replace(/^\.\//, '')
    if (resolveInside(cwd, rel)) out.push(rel)
  }
  return out
}

/** Skeleton fallback: manifests + README + architecture docs + referenced files. */
function skeletonCandidates(cwd: string, artifact: string): string[] {
  const out: string[] = []
  const push = (rel: string): void => { if (resolveInside(cwd, rel)) out.push(rel) }
  for (const m of MANIFESTS) push(m)
  push('README.md')
  const archDir = resolveInside(cwd, 'docs/architecture')
  if (archDir) {
    try {
      fs.readdirSync(archDir).filter((f) => f.endsWith('.md')).sort().slice(0, 3)
        .forEach((f) => push(`docs/architecture/${f}`))
    } catch { /* ignore */ }
  }
  for (const rel of referencedPaths(cwd, artifact)) push(rel)
  return out
}

/**
 * Build the repo-grounding context blob (D3). Agent-supplied paths take
 * priority; otherwise a structural skeleton. No embeddings, no network — a
 * deterministic, repo-contained read. The same blob goes to every channel.
 */
export function buildRepoContext(opts: BuildContextOpts): RepoContext {
  const { cwd, explicitPaths, artifact } = opts
  const budget = opts.budgetChars ?? 40000

  const tree = walkTree(cwd).slice(0, TREE_CAP)
  let treeBlock = `## Repository tree\n\`\`\`\n${tree.join('\n')}\n\`\`\``
  const TREE_TRUNC = '\n_(tree truncated)_'
  if (treeBlock.length > budget) {
    treeBlock = treeBlock.slice(0, Math.max(0, budget - TREE_TRUNC.length)) + TREE_TRUNC
  }
  const parts: string[] = [treeBlock]
  let size = treeBlock.length
  const used: string[] = []
  const seen = new Set<string>()
  let truncated = false

  const candidates = explicitPaths && explicitPaths.length > 0
    ? explicitPaths
    : skeletonCandidates(cwd, artifact)

  for (const rel of candidates) {
    const abs = resolveInside(cwd, rel)
    if (!abs) continue
    const display = path.relative(cwd, abs)             // always repo-relative (no absolute leak)
    if (seen.has(display) || hasIgnoredSegment(display) || isSensitiveFile(display)) continue
    const content = readTextFile(abs)
    if (content === null) continue
    const block = `### ${display}\n\`\`\`\n${content}\n\`\`\``
    if (size + block.length + 2 > budget) {
      truncated = true
      continue
    }
    seen.add(display)
    parts.push(block)
    used.push(display)
    size += block.length + 2
  }

  if (truncated) parts.push(`_(context truncated at budget ${budget} chars)_`)
  return { context: parts.join('\n\n'), used }
}
