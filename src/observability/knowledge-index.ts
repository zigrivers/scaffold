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

// ─── emitOnceForAudit ───────────────────────────────────────────────────────

/**
 * Write `message` to process.stderr exactly once per (set, key) tuple.
 * The dedup state lives in the caller-provided `warnedKeys` Set, NOT
 * in module-level state — this is intentional so multiple runAudit
 * invocations in one process (e.g. the --fix flow's initial + verifier
 * + postfix audits, or vitest's shared-module-state tests) each get
 * their own dedup scope. runAudit creates a fresh Set for each
 * invocation; tests pass their own.
 *
 * Uses process.stderr.write directly rather than console.warn so the
 * output never collides with JSON renders of audit output on stdout.
 */
export function emitOnceForAudit(
  warnedKeys: Set<string>,
  key: string,
  message: string,
): void {
  if (warnedKeys.has(key)) return
  warnedKeys.add(key)
  process.stderr.write(message)
}

// ─── resolveKnowledgeRoot ───────────────────────────────────────────────────

import { loadObservabilityConfig } from './engine/checks/observability-config.js'

/** Thrown by `resolveKnowledgeRoot` when an operator-supplied CLI
 *  override path fails validation. The CLI handler (handleAudit)
 *  catches it and exits non-zero. */
export class KnowledgeRootCliInvalidError extends Error {
  constructor(public readonly path: string, public readonly reason: string) {
    super(`--knowledge-root path '${path}' is invalid: ${reason}`)
    this.name = 'KnowledgeRootCliInvalidError'
  }
}

export interface KnowledgeRootAttempt {
  source: 'cli' | 'yaml' | 'auto-detect'
  path?: string
  outcome: 'used' | 'invalid' | 'not-provided' | 'not-found'
  reason?: string
}

export interface KnowledgeRootResolution {
  /** Validated absolute path to a knowledge directory, or null. */
  root: string | null
  /** Pre-loaded index Set, populated by the validator. Null when root
   *  is null. Lens I reads this directly — no re-walk. */
  index: Set<string> | null
  /** Audit trail of what was tried. Lens I uses this to compose a
   *  precise warn-once message when root is null. */
  attempts: KnowledgeRootAttempt[]
}

export interface ResolveInput {
  /** Optional caller-supplied CLI override (operator-typed
   *  --knowledge-root flag). Invalid paths throw
   *  KnowledgeRootCliInvalidError. */
  override?: string
  /** Working directory for reading .scaffold/observability.yaml. When
   *  undefined, the yaml tier is skipped (recorded as
   *  outcome: 'not-provided'). Typically the audited project's root. */
  cwd?: string
  /** Optional starting directory for the auto-detect parent-walk.
   *  Production callers (runAudit, runFixFlow) pass a directory
   *  INSIDE the CLI install — typically
   *  `dirname(fileURLToPath(import.meta.url))` of their own module —
   *  so the walk finds the install's `package.json` and
   *  `content/knowledge/`. When undefined, falls back to `cwd` (and
   *  then `process.cwd()`); this fallback is intended for tests, NOT
   *  production. Without selfLocation, auto-detect cannot succeed for
   *  downstream users running scaffold from outside the scaffold repo. */
  selfLocation?: string
}

/**
 * 3-tier knowledge-root resolution per the design spec (§2):
 *   1. CLI override (hard-errors on validation failure)
 *   2. .scaffold/observability.yaml lenses.I-knowledge-gaps.knowledge_root
 *      (soft-fails to auto-detect on validation failure)
 *   3. findScaffoldKnowledgeRoot starting from cwd (returns null if no
 *      scaffold install is above the start dir)
 *
 * Returns a record carrying the validated root, the pre-loaded index
 * (eliminating the need for a second walk in Lens I), and the
 * attempts trail (used by Lens I's warning composition).
 */
export function resolveKnowledgeRoot(input: ResolveInput): KnowledgeRootResolution {
  const attempts: KnowledgeRootAttempt[] = []

  // Tier 1: CLI override (resolved to absolute against process.cwd()
  // — the operator typed it at the command line, so process.cwd() is
  // the expected anchor for relative paths)
  if (input.override !== undefined && input.override !== '') {
    const absOverride = path.resolve(input.override)
    const result = validateKnowledgeRoot(absOverride)
    if (result.ok) {
      attempts.push({ source: 'cli', path: absOverride, outcome: 'used' })
      return { root: absOverride, index: result.index, attempts }
    }
    throw new KnowledgeRootCliInvalidError(absOverride, result.reason)
  }
  attempts.push({ source: 'cli', outcome: 'not-provided' })

  // Tier 2: yaml config (relative paths in the yaml are resolved
  // against input.cwd — the project root where the yaml file lives)
  if (input.cwd === undefined) {
    attempts.push({ source: 'yaml', outcome: 'not-provided' })
  } else {
    const config = loadObservabilityConfig(input.cwd)
    const yamlPath = config.lenses['I-knowledge-gaps']?.knowledge_root
    if (yamlPath === undefined || yamlPath === '') {
      attempts.push({ source: 'yaml', outcome: 'not-provided' })
    } else {
      const absYamlPath = path.resolve(input.cwd, yamlPath)
      const result = validateKnowledgeRoot(absYamlPath)
      if (result.ok) {
        attempts.push({ source: 'yaml', path: absYamlPath, outcome: 'used' })
        return { root: absYamlPath, index: result.index, attempts }
      }
      attempts.push({ source: 'yaml', path: absYamlPath, outcome: 'invalid', reason: result.reason })
    }
  }

  // Tier 3: auto-detect (starts from the CLI install's module location
  // when production callers supply selfLocation; falls back to cwd /
  // process.cwd() for test convenience only).
  const startDir = input.selfLocation ?? input.cwd ?? process.cwd()
  const autoRoot = findScaffoldKnowledgeRoot(startDir)
  if (autoRoot === null) {
    attempts.push({ source: 'auto-detect', outcome: 'not-found' })
    return { root: null, index: null, attempts }
  }
  const result = validateKnowledgeRoot(autoRoot)
  if (result.ok) {
    attempts.push({ source: 'auto-detect', path: autoRoot, outcome: 'used' })
    return { root: autoRoot, index: result.index, attempts }
  }
  attempts.push({ source: 'auto-detect', path: autoRoot, outcome: 'invalid', reason: result.reason })
  return { root: null, index: null, attempts }
}
