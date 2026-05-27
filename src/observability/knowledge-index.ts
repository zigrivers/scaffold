import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import yaml from 'js-yaml'
import { normalizeTopic } from './checks/lens-i-lessons-scanner.js'

// ─── loadKnowledgeIndex ─────────────────────────────────────────────────────

const FRONTMATTER_DELIMITER = '---'

/**
 * Extract the `name:` field from a knowledge entry's YAML frontmatter.
 * Uses js-yaml (the same parser the assembly engine's extractKBFrontmatter
 * and the freshness validator both use) so we accept exactly the same
 * shapes — including comments, quoted values, and any YAML-valid form.
 *
 * Returns null if there is no frontmatter, no closing delimiter, the YAML
 * fails to parse, or there is no usable `name:` (matches
 * extractKBFrontmatter at src/core/assembly/knowledge-loader.ts:102-104:
 * any non-empty trimmed string is accepted; slug regex enforcement stays
 * in the freshness validator only).
 */
function extractName(content: string): string | null {
  const lines = content.split('\n')
  if (lines[0]?.trim() !== FRONTMATTER_DELIMITER) return null
  let closeIdx = -1
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === FRONTMATTER_DELIMITER) { closeIdx = i; break }
  }
  if (closeIdx === -1) return null  // unclosed frontmatter
  let parsed: unknown
  try { parsed = yaml.load(lines.slice(1, closeIdx).join('\n'), { schema: yaml.JSON_SCHEMA }) }
  catch { return null }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
  const raw = (parsed as Record<string, unknown>)['name']
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim()
  return trimmed.length > 0 ? trimmed : null
}

function walkMarkdown(dir: string, out: string[]): void {
  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walkMarkdown(full, out)
    else if (entry.isFile() && entry.name.endsWith('.md') && entry.name !== 'README.md') {
      out.push(full)
    }
  }
}

/**
 * Walk knowledgeDir recursively, parse each .md file's frontmatter, and
 * return the Set of `name:` slugs. Throws if knowledgeDir does not exist
 * or is not a directory. README.md files are excluded (matches the
 * assembly loader's behavior).
 *
 * Acceptance rule matches extractKBFrontmatter: any non-empty trimmed
 * `name:` value is accepted. The slug regex lives in the freshness
 * validator, not here — keeping the loader permissive prevents drift
 * between what the assembly engine sees and what suppression matches.
 *
 * Uses js-yaml (already a project dependency — see
 * src/core/assembly/knowledge-loader.ts, observability-config.ts, and
 * knowledge-frontmatter-validator.ts) rather than a regex so we accept
 * exactly the same shapes the assembly engine does (comments, quoted
 * values, nested structures). The "dependency-free" Cross-Cutting
 * principle applies only to the directory walk + file I/O — not to
 * the frontmatter parsing.
 */
export function loadKnowledgeIndex(knowledgeDir: string): Set<string> {
  const stat = fs.statSync(knowledgeDir)  // throws if missing
  if (!stat.isDirectory()) {
    throw new Error(`knowledge directory is not a directory: ${knowledgeDir}`)
  }
  const files: string[] = []
  walkMarkdown(knowledgeDir, files)
  const out = new Set<string>()
  for (const file of files) {
    let content: string
    try { content = fs.readFileSync(file, 'utf8') } catch { continue }
    const rawName = extractName(content)
    if (!rawName) continue
    // Normalize using the same function Lens I applies to gap-signal
    // topics before bucketing (lens-i-knowledge-gaps.ts:73 +
    // lens-i-lessons-scanner.ts:32). The suppression lookup later is
    // `index.has(normalizedTopic)`; if the loader stored the raw value
    // it would silently miss-suppress any entry whose `name:` is in
    // non-canonical form. normalizeTopic returns '' for non-matching
    // input; skip those (the freshness validator enforces kebab-case
    // on real entries anyway).
    const norm = normalizeTopic(rawName)
    if (norm) out.add(norm)
  }
  return out
}

// ─── formatForStderr ────────────────────────────────────────────────────────

const STDERR_UNSAFE_RE = /[\r\n\t\x00-\x1f]/g

/**
 * Wrap a value for safe one-line stderr interpolation. Wraps in single
 * quotes, escapes embedded single quotes with backslash, replaces
 * newlines/control characters with `?`. Returns the literal `'<missing>'`
 * for undefined or empty input. Used by Lens I when composing
 * warn-once messages that include operator-supplied paths or
 * loader-supplied error reasons.
 */
export function formatForStderr(value: string | undefined): string {
  if (value === undefined || value === '') return "'<missing>'"
  return "'" + value.replace(/'/g, "\\'").replace(STDERR_UNSAFE_RE, '?') + "'"
}

// ─── findScaffoldKnowledgeRoot ──────────────────────────────────────────────

const SCAFFOLD_PACKAGE_NAME = '@zigrivers/scaffold'

function readPackageName(packageJsonPath: string): string | null {
  try {
    const raw = fs.readFileSync(packageJsonPath, 'utf8')
    const parsed = JSON.parse(raw) as { name?: unknown }
    return typeof parsed.name === 'string' ? parsed.name : null
  } catch {
    return null
  }
}

/**
 * Walk parent directories of `startDir` and return the absolute path of
 * the first `<parent>/content/knowledge` where `<parent>/package.json`
 * declares `name: "@zigrivers/scaffold"`. Walks to the filesystem root
 * without any home-directory boundary (npm-global installs live in
 * /opt/homebrew/... or /usr/local/..., outside the user's home).
 *
 * Returns null when no matching parent is found.
 *
 * The argument is the starting directory; production callers pass
 * `path.dirname(fileURLToPath(import.meta.url))` from a module that
 * lives inside the install. Tests can pass any directory directly.
 */
export function findScaffoldKnowledgeRoot(startDir: string): string | null {
  let current = path.resolve(startDir)
  while (true) {
    const pkgPath = path.join(current, 'package.json')
    if (fs.existsSync(pkgPath) && readPackageName(pkgPath) === SCAFFOLD_PACKAGE_NAME) {
      const candidate = path.join(current, 'content', 'knowledge')
      if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
        return candidate
      }
    }
    const parent = path.dirname(current)
    if (parent === current) return null   // filesystem root
    current = parent
  }
}

/** Convenience for production callers — derives the start dir from a
 *  module's import.meta.url. `runAudit` and `runFixFlow` call this
 *  with their own `import.meta.url` to anchor the auto-detect walk to
 *  the install location. Tests should call `findScaffoldKnowledgeRoot`
 *  directly with a fixture path. */
export function findScaffoldKnowledgeRootFromImportMeta(metaUrl: string): string | null {
  return findScaffoldKnowledgeRoot(path.dirname(fileURLToPath(metaUrl)))
}

// ─── validateKnowledgeRoot ──────────────────────────────────────────────────

export type ValidateResult =
  | { ok: true; index: Set<string> }
  | { ok: false; reason: string }

/**
 * Validate that `candidatePath` is a real scaffold knowledge directory.
 * Two checks:
 *
 *   1. The directory exists, IS a directory, and contains a `VERSION`
 *      marker file. VERSION lives ONLY at content/knowledge/VERSION in
 *      the scaffold repo (added in Phase 1); requiring it forecloses
 *      "operator pointed at an ancestor" cases like
 *      `--knowledge-root <repo>/content` that would otherwise pass an
 *      empty-tree-loose validator (the recursive walk would find the
 *      nested KB entries).
 *   2. loadKnowledgeIndex(candidatePath) succeeds. An empty Set is
 *      valid (freshly-initialized KB).
 *
 * Returns { ok: true, index } on success so the resolver doesn't have
 * to walk a second time.
 */
export function validateKnowledgeRoot(candidatePath: string): ValidateResult {
  let stat: fs.Stats
  try { stat = fs.statSync(candidatePath) }
  catch { return { ok: false, reason: `path does not exist: ${candidatePath}` } }
  if (!stat.isDirectory()) {
    return { ok: false, reason: `path is not a directory: ${candidatePath}` }
  }
  const markerPath = path.join(candidatePath, 'VERSION')
  if (!fs.existsSync(markerPath)) {
    return {
      ok: false,
      reason: `missing knowledge-base VERSION marker — path does not appear to be a scaffold knowledge directory: ${candidatePath}`,
    }
  }
  let index: Set<string>
  try { index = loadKnowledgeIndex(candidatePath) }
  catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, reason: `index load failed: ${msg}` }
  }
  return { ok: true, index }
}
