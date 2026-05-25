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

// F-007: the former `readPrBody` helper was removed. Anti-over-rewrite no
// longer reads the PR body — the override is now a maintainer-applied label
// passed explicitly via `--pr-labels` from the workflow (see F-005).

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
