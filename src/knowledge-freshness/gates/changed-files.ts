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
export function resolveTargetFiles(args: string[], cwd: string): string[] {
  if (args.length > 0) {
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

/**
 * Read the PR body via `gh pr view --json body`. Returns null when `gh` is
 * not on PATH, when no PR is associated with the branch, or when the command
 * fails for any reason — the anti-over-rewrite gate falls back to "no
 * override" in that case, which is the safe default (blocking for stable).
 */
export function readPrBody(cwd: string): string | null {
  const out = spawnSync('gh', ['pr', 'view', '--json', 'body', '-q', '.body'], {
    cwd, encoding: 'utf8',
  })
  if (out.status !== 0) return null
  const trimmed = out.stdout.trimEnd()
  return trimmed.length > 0 ? trimmed : ''
}

/**
 * Produce a unified diff (relative to origin/main) for a SPECIFIC set of
 * files. Returns an empty string when there are no changes. We need the diff
 * (not just the post-change content) for lint-unsourced and
 * anti-over-rewrite churn counting.
 */
export function gitDiffForFiles(cwd: string, files: string[]): string {
  if (files.length === 0) return ''
  const relFiles = files.map((f) => path.relative(cwd, f))
  const out = spawnSync(
    'git',
    ['diff', '--no-color', 'origin/main...HEAD', '--', ...relFiles],
    { cwd, encoding: 'utf8' },
  )
  if (out.status !== 0) {
    throw new Error(
      `git diff failed (exit ${out.status}): ${out.stderr || '<no stderr>'}`,
    )
  }
  return out.stdout
}
