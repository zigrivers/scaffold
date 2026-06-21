import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const TEMPLATES_ROOT = resolve(__dirname, '../../templates/skills')

/** Platforms that can host an installable MMR review skill. */
export const SKILL_PLATFORMS = ['cursor', 'codex', 'antigravity'] as const
export type SkillPlatform = (typeof SKILL_PLATFORMS)[number]

/** Delimiters for the idempotent managed block in shared instruction files. */
export const MANAGED_BEGIN = '<!-- BEGIN mmr-skill -->'
export const MANAGED_END = '<!-- END mmr-skill -->'

interface PlatformSpec {
  /** Path to write, relative to the project root. */
  targetRelPath: string
  /**
   * `file`  — a dedicated file MMR owns; created if absent, overwritten only with `force`.
   * `block` — a shared instruction file; MMR manages only the delimited block, idempotently.
   */
  mode: 'file' | 'block'
  /** Template file relative to templates/skills. */
  templateFile: string
}

/**
 * Codex and Antigravity both follow the `AGENTS.md` standard, so they resolve to the
 * same target and body. Cursor and Gemini each have their own convention.
 */
export const PLATFORM_SPECS: Record<SkillPlatform, PlatformSpec> = {
  cursor: {
    targetRelPath: join('.cursor', 'rules', 'mmr-review.mdc'),
    mode: 'file',
    templateFile: join('cursor', 'mmr-review.mdc'),
  },
  codex: {
    targetRelPath: 'AGENTS.md',
    mode: 'block',
    templateFile: join('agents', 'mmr-review.md'),
  },
  antigravity: {
    targetRelPath: 'AGENTS.md',
    mode: 'block',
    templateFile: join('agents', 'mmr-review.md'),
  },
}

const templateCache = new Map<string, string>()

function loadTemplate(templateFile: string): string {
  const cached = templateCache.get(templateFile)
  if (cached !== undefined) return cached
  const body = readFileSync(resolve(TEMPLATES_ROOT, templateFile), 'utf-8')
  templateCache.set(templateFile, body)
  return body
}

/** Wrap a body in the managed-block delimiters. */
export function renderManagedBlock(body: string): string {
  return `${MANAGED_BEGIN}\n${body.trimEnd()}\n${MANAGED_END}\n`
}

// Greedy span from the first BEGIN to the LAST END so the whole managed region is
// replaced even if a body documents the markers or an earlier run left duplicates;
// `\r?` tolerates CRLF files so re-runs still match (the rewritten block uses LF).
const blockRe = new RegExp(
  `${escapeRe(MANAGED_BEGIN)}[\\s\\S]*${escapeRe(MANAGED_END)}\\r?\\n?`,
)

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Insert or replace the managed block in an existing file's contents. When no block
 * is present, the block is appended (separated by a blank line if the file is
 * non-empty). Content outside the block is preserved verbatim.
 */
export function upsertManagedBlock(existing: string, body: string): string {
  const block = renderManagedBlock(body)
  if (blockRe.test(existing)) {
    // Replacer function (not a raw string) so `$&`, `$$`, `$1`… in the body are
    // inserted literally rather than interpreted as replacement patterns.
    return existing.replace(blockRe, () => block)
  }
  if (existing.trim() === '') return block
  const separator = existing.endsWith('\n') ? '\n' : '\n\n'
  return `${existing}${separator}${block}`
}

export type PlanAction = 'create' | 'update' | 'unchanged' | 'blocked-exists'

export interface PlanEntry {
  /** Requested platforms that resolved to this target (deduped by path). */
  platforms: SkillPlatform[]
  relPath: string
  absPath: string
  mode: 'file' | 'block'
  action: PlanAction
  /** Full file content to write (undefined when blocked or unchanged). */
  content?: string
}

export interface PlanOptions {
  projectRoot: string
  platforms: SkillPlatform[]
  force?: boolean
}

/**
 * Resolve an install plan. Reads the filesystem to determine each action and the
 * exact content that would be written, but performs no writes. Targets shared by
 * multiple platforms (Codex + Antigravity → AGENTS.md) collapse into one entry.
 */
export function planSkillInstall(opts: PlanOptions): PlanEntry[] {
  const { projectRoot, platforms, force = false } = opts
  const byPath = new Map<string, PlanEntry>()

  for (const platform of platforms) {
    const spec = PLATFORM_SPECS[platform]
    const absPath = resolve(projectRoot, spec.targetRelPath)
    const existing = byPath.get(absPath)
    if (existing) {
      existing.platforms.push(platform)
      continue
    }

    const body = loadTemplate(spec.templateFile)
    byPath.set(absPath, buildEntry({ platform, spec, absPath, body, force }))
  }

  return [...byPath.values()]
}

function buildEntry(args: {
  platform: SkillPlatform
  spec: PlatformSpec
  absPath: string
  body: string
  force: boolean
}): PlanEntry {
  const { platform, spec, absPath, body, force } = args
  const base = {
    platforms: [platform],
    relPath: spec.targetRelPath,
    absPath,
    mode: spec.mode,
  }
  const exists = existsSync(absPath)

  if (spec.mode === 'file') {
    if (!exists) return { ...base, action: 'create', content: body }
    const current = readFileSync(absPath, 'utf-8')
    if (current === body) return { ...base, action: 'unchanged' }
    if (!force) return { ...base, action: 'blocked-exists' }
    return { ...base, action: 'update', content: body }
  }

  // block mode — always safe to write; only our delimited block is touched.
  const current = exists ? readFileSync(absPath, 'utf-8') : ''
  const next = upsertManagedBlock(current, body)
  if (exists && current === next) return { ...base, action: 'unchanged' }
  return { ...base, action: exists ? 'update' : 'create', content: next }
}

/** Write the resolved plan to disk. Entries without content (unchanged/blocked) are skipped. */
export function executePlan(plan: PlanEntry[]): void {
  for (const entry of plan) {
    if (entry.content === undefined) continue
    mkdirSync(dirname(entry.absPath), { recursive: true })
    writeFileSync(entry.absPath, entry.content)
  }
}

export class UnknownPlatformError extends Error {
  constructor(public readonly value: string) {
    super(
      `Unknown platform "${value}". Choose from: ${SKILL_PLATFORMS.join(', ')}, or use --all.`,
    )
    this.name = 'UnknownPlatformError'
  }
}

/** Normalize requested platforms (dedup, validate, or expand `--all`). */
export function resolvePlatforms(requested: string[], all: boolean): SkillPlatform[] {
  if (all) return [...SKILL_PLATFORMS]
  const out: SkillPlatform[] = []
  for (const raw of requested) {
    const value = raw.trim().toLowerCase()
    if (!isSkillPlatform(value)) throw new UnknownPlatformError(raw)
    if (!out.includes(value)) out.push(value)
  }
  return out
}

function isSkillPlatform(value: string): value is SkillPlatform {
  return (SKILL_PLATFORMS as readonly string[]).includes(value)
}
