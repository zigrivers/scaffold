import fs from 'node:fs'
import path from 'node:path'
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
