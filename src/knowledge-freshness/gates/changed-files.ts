import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import yaml from 'js-yaml'

/**
 * Resolve the list of changed knowledge-entry .md files for a gate run.
 *
 * Argument semantics:
 *   - If `args` has entries, treat them as file paths (relative or absolute)
 *     and use them directly. Operators pass explicit files when iterating
 *     locally; the workflow passes them when GitHub's "changed files" API
 *     surface is more convenient than re-running `git diff`.
 *   - Otherwise fall back to `git diff --name-only origin/main...HEAD`,
 *     filtering to `content/knowledge/**\/*.md` so callers can run the CLI
 *     on a feature branch without flag plumbing.
 *
 * Returns absolute paths so callers can `fs.readFileSync` directly.
 */
export interface ResolveOptions {
  /**
   * Read the file list from a JSON file (must be an array of strings). Used
   * by the CI workflow to avoid shell-interpolating PR-controlled filenames
   * (round-2 F-001) — a PR could add a content/knowledge path containing
   * shell metacharacters that would `$()`-execute inside the workflow's
   * bash. Reading from a JSON file lets us validate each entry on the Node
   * side without ever touching bash.
   */
  filesFrom?: string
}

/** Reject any path that escapes content/knowledge/, contains shell metas, or isn't a .md file. */
function validateGatePath(rel: string): void {
  if (!rel.startsWith('content/knowledge/')) {
    throw new Error(`refusing gate path outside content/knowledge/: ${JSON.stringify(rel)}`)
  }
  if (!rel.endsWith('.md')) {
    throw new Error(`refusing non-markdown gate path: ${JSON.stringify(rel)}`)
  }
  if (rel.includes('..')) {
    throw new Error(`refusing gate path containing "..": ${JSON.stringify(rel)}`)
  }
  // Belt-and-braces: even though we never interpolate these paths into a
  // shell, reject the metacharacters a future regression might.
  if (/[\s;|&`$<>"'\\(){}*?]/.test(rel)) {
    throw new Error(`refusing gate path with shell metacharacters: ${JSON.stringify(rel)}`)
  }
}

export function resolveTargetFiles(args: string[], cwd: string, opts: ResolveOptions = {}): string[] {
  if (opts.filesFrom) {
    const raw = fs.readFileSync(path.resolve(cwd, opts.filesFrom), 'utf8')
    let parsed: unknown
    try { parsed = JSON.parse(raw) }
    catch (e) { throw new Error(`--files-from JSON parse error: ${(e as Error).message}`) }
    if (!Array.isArray(parsed)) throw new Error('--files-from must be a JSON array of strings')
    const out: string[] = []
    for (const p of parsed) {
      if (typeof p !== 'string') throw new Error('--files-from entries must be strings')
      validateGatePath(p)
      out.push(path.resolve(cwd, p))
    }
    return out
  }
  if (args.length > 0) {
    // Even explicit args go through the validator — the CLI is called from
    // workflows too, and we want one validation chokepoint.
    for (const a of args) {
      const rel = path.isAbsolute(a) ? path.relative(cwd, a) : a
      validateGatePath(rel)
    }
    return args.map((p) => path.resolve(cwd, p))
  }
  const out = spawnSync('git', ['diff', '--name-only', 'origin/main...HEAD'], {
    cwd, encoding: 'utf8',
  })
  if (out.status !== 0) {
    throw new Error(
      `git diff failed (exit ${out.status}): ${out.stderr || '<no stderr>'}\n` +
      'If you are running this gate locally without an origin/main, pass file paths explicitly.',
    )
  }
  return out.stdout
    .split('\n')
    .map((s) => s.trim())
    .filter((s) => s.startsWith('content/knowledge/') && s.endsWith('.md'))
    .map((p) => path.resolve(cwd, p))
}

/**
 * Read the operator opt-out list for link-checking from
 * `.scaffold/observability.yaml` under `knowledge_freshness.link_check.skip`.
 * Empty list when the file or key is missing — the default is "no opt-outs"
 * per the task spec ("no opt-outs" if no list exists).
 */
export function loadLinkCheckSkip(projectRoot: string): string[] {
  const yamlPath = path.join(projectRoot, '.scaffold', 'observability.yaml')
  if (!fs.existsSync(yamlPath)) return []
  try {
    const parsed = yaml.load(fs.readFileSync(yamlPath, 'utf8'), { schema: yaml.JSON_SCHEMA }) as
      Record<string, unknown> | null
    if (!parsed || typeof parsed !== 'object') return []
    const kf = parsed['knowledge_freshness']
    if (!kf || typeof kf !== 'object') return []
    const lc = (kf as Record<string, unknown>)['link_check']
    if (!lc || typeof lc !== 'object') return []
    const skip = (lc as Record<string, unknown>)['skip']
    if (!Array.isArray(skip)) return []
    return skip.filter((s): s is string => typeof s === 'string' && s.length > 0)
  } catch {
    return []
  }
}

// F-007: the former `readPrBody` helper was removed. Anti-over-rewrite no
// longer reads the PR body — the override is now a maintainer-applied label
// passed explicitly via `--pr-labels` from the workflow (see F-005).

/**
 * Produce a unified diff for a SPECIFIC set of files.
 *
 * Round-2 F-003: this used to diff `origin/main...HEAD`, which produced an
 * empty diff in both deployment shapes:
 *   - PR gate workflow: HEAD of the base checkout IS origin/main (since the
 *     PR head's content/knowledge/ is OVERLAID, not merged). So
 *     `origin/main...HEAD` returns nothing even when the overlay added
 *     thousands of lines.
 *   - Cron inline gates: audit-apply edits on disk WITHOUT committing,
 *     so HEAD is still main and the diff is empty.
 *
 * Diffing the working tree (no commit ranges, just `git diff -- <files>`)
 * captures both uncommitted edits AND overlaid files. That's the right
 * shape for every gate-execution context we use.
 *
 * Returns an empty string when there are no changes.
 */
export function gitDiffForFiles(cwd: string, files: string[]): string {
  if (files.length === 0) return ''
  const relFiles = files.map((f) => path.relative(cwd, f))
  const out = spawnSync(
    'git',
    ['diff', '--no-color', '--', ...relFiles],
    { cwd, encoding: 'utf8' },
  )
  if (out.status !== 0) {
    throw new Error(
      `git diff failed (exit ${out.status}): ${out.stderr || '<no stderr>'}`,
    )
  }
  return out.stdout
}
