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

const IGNORE_DIRS = new Set(['.git', 'node_modules', 'dist', 'build', 'coverage', '.next', '.cache', '.turbo'])
const MANIFESTS = [
  'package.json', 'tsconfig.json', 'pyproject.toml', 'go.mod', 'Cargo.toml', 'requirements.txt', 'Gemfile', 'pom.xml',
]
const MAX_FILE_BYTES = 64 * 1024
const TREE_CAP = 200

/** Resolve a repo-relative path, returning null if it escapes the repo root. */
function resolveInside(cwd: string, rel: string): string | null {
  const abs = path.resolve(cwd, rel)
  const relCheck = path.relative(cwd, abs)
  if (relCheck === '' || relCheck.startsWith('..') || path.isAbsolute(relCheck)) return null
  return abs
}

/** Shallow file list (depth ≤ maxDepth), skipping ignored dirs. */
function walkTree(cwd: string, maxDepth = 3): string[] {
  const out: string[] = []
  const walk = (dir: string, depth: number): void => {
    if (depth > maxDepth || out.length >= TREE_CAP * 4) return
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.git') || IGNORE_DIRS.has(entry.name)) continue
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(full, depth + 1)
      else if (entry.isFile()) out.push(path.relative(cwd, full))
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
  const seen = new Set<string>()
  const out: string[] = []
  for (const m of matches) {
    const rel = m.replace(/^\.\//, '')
    if (seen.has(rel)) continue
    seen.add(rel)
    const abs = resolveInside(cwd, rel)
    if (abs && fs.existsSync(abs) && fs.statSync(abs).isFile()) out.push(rel)
  }
  return out
}

/** Skeleton fallback: manifests + README + architecture docs + referenced files. */
function skeletonCandidates(cwd: string, artifact: string): string[] {
  const out: string[] = []
  const push = (rel: string): void => {
    const abs = resolveInside(cwd, rel)
    if (abs && fs.existsSync(abs) && fs.statSync(abs).isFile() && !out.includes(rel)) out.push(rel)
  }
  for (const m of MANIFESTS) push(m)
  push('README.md')
  const archDir = resolveInside(cwd, 'docs/architecture')
  if (archDir && fs.existsSync(archDir)) {
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
  const treeBlock = `## Repository tree\n\`\`\`\n${tree.join('\n')}\n\`\`\``
  const parts: string[] = [treeBlock]
  let size = treeBlock.length
  const used: string[] = []
  let truncated = false

  const candidates = explicitPaths && explicitPaths.length > 0
    ? explicitPaths.map((p) => p.replace(/^\.\//, ''))
    : skeletonCandidates(cwd, artifact)

  for (const rel of candidates) {
    const abs = resolveInside(cwd, rel)
    if (!abs) continue
    const content = readTextFile(abs)
    if (content === null) continue
    const block = `### ${rel}\n\`\`\`\n${content}\n\`\`\``
    if (size + block.length + 2 > budget) {
      truncated = true
      continue
    }
    parts.push(block)
    used.push(rel)
    size += block.length + 2
  }

  if (truncated) parts.push(`_(context truncated at budget ${budget} chars)_`)
  return { context: parts.join('\n\n'), used }
}
