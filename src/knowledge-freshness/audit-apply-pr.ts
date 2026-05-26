import { spawnSync } from 'node:child_process'
import path from 'node:path'
import yaml from 'js-yaml'
import type { AuditVerdict } from './audit-runner.js'

/**
 * Pure rendering of the PR title/body for a freshness audit. Kept separate
 * from the git/gh side effects in `openFreshnessPr` so the rendering is
 * testable without invoking subprocesses (Task 10 acceptance: "The PR
 * title/body rendering MUST be a pure function").
 */
export interface RenderPrOptions {
  /** Optional MMR job ID to reference in the PR body (Task 11 will gate on it). */
  mmrJobId?: string
}

export interface RenderedPr {
  title: string
  body: string
  /** Branch suffix derived from entry name; caller pairs with a date. */
  entryName: string
}

/**
 * One-sentence summary of the verdict's source list. Used in the PR title
 * (which has length limits) so the operator sees at a glance which doc the
 * audit is calibrated against.
 */
function oneSentenceSourceSummary(verdict: AuditVerdict): string {
  const urls = verdict.sources_checked.map((s) => s.url)
  if (urls.length === 0) return '(no sources)'
  if (urls.length === 1) return urls[0]
  return `${urls[0]} and ${urls.length - 1} other source(s)`
}

/**
 * Markdown-escape a cell so a stray `|` or backtick in a finding doesn't
 * break the table layout. We don't try to render arbitrary markdown — the
 * cell is a single line of plain text.
 */
function escapeCell(s: string): string {
  // Round-7 F-004 follow-through: collapse ALL JS line terminators so
  // table cells can't smuggle in a BREAKING CHANGE: footer via lone \r
  // or Unicode line separators.
  return s
    .replace(/\|/g, '\\|')
    .replace(/[\r\n\u2028\u2029]+/g, ' ')
    .trim()
}

export function renderFindingsTable(verdict: AuditVerdict): string {
  if (verdict.findings.length === 0) {
    return '_No findings._'
  }
  const header = '| severity | drift_kind | claim_in_entry | evidence_url |'
  const sep = '|---|---|---|---|'
  const rows = verdict.findings.map((f) => {
    const severity = escapeCell(f.severity)
    const driftKind = escapeCell(f.drift_kind)
    const claim = escapeCell(f.claim_in_entry)
    const evidence = escapeCell(f.evidence_url)
    return `| ${severity} | ${driftKind} | ${claim} | ${evidence} |`
  })
  return [header, sep, ...rows].join('\n')
}

export function renderPrTitle(verdict: AuditVerdict): string {
  // Round-8 F-002: sanitize ALL title components — both entry_name and
  // the source summary — so an LLM-injected `\nBREAKING CHANGE:` (via
  // verdict.entry_name or sources_checked[*].url) cannot turn a
  // chore-refresh title into a major-bump signal. The body sanitization
  // alone wasn't enough; deriveBumpKind also reads the title.
  const name = sanitizeLlmField(verdict.entry_name)
  const summary = sanitizeLlmField(oneSentenceSourceSummary(verdict))
  return `chore(knowledge): refresh ${name} against ${summary}`
}

/**
 * Collapse ALL JavaScript line terminators in LLM-controlled text before
 * splicing into the PR body. F-003 round-4 introduced this for `\r\n`/`\n`;
 * F-002/F-003/F-004 round-7 extends it to lone `\r` and the Unicode line
 * separators `<U+2028>` / `<U+2029>`, since JS regex multiline-mode `^` treats
 * those as line starts. Without exhaustive sanitization, an LLM-controlled
 * field carrying `\rBREAKING CHANGE:` or `<U+2028>BREAKING CHANGE:` would
 * still inject a major-bump footer that the version-bump workflow honors.
 *
 * Citations of "BREAKING CHANGE:" in evidence text mid-line remain
 * legitimate; the round-2 start-of-line anchor on deriveBumpKind plus the
 * collapsing here ensure such mentions never become footers.
 */
function sanitizeLlmField(s: string): string {
  return s.replace(/[\r\n\u2028\u2029]+/g, ' ').trim()
}

export function renderPrBody(verdict: AuditVerdict, opts: RenderPrOptions = {}): string {
  const sourceList = verdict.sources_checked.length === 0
    ? '_No sources._'
    : verdict.sources_checked.map((s) => `- ${sanitizeLlmField(s.url)}`).join('\n')

  const provenance = verdict.sources_checked.length === 0
    ? '_No sources._'
    : verdict.sources_checked
      .map((s) => {
        const u = sanitizeLlmField(s.url)
        const h = sanitizeLlmField(s.content_hash)
        const r = sanitizeLlmField(s.retrieved_at)
        return `- ${u} (${h}, retrieved ${r})`
      })
      .join('\n')

  const preserveSection = verdict.preserve_warnings.length === 0
    ? '_None._'
    : verdict.preserve_warnings.map((w) => `- ${sanitizeLlmField(w)}`).join('\n')

  const mmrLine = opts.mmrJobId
    ? `job_id: ${opts.mmrJobId}`
    : '_Not run inline — see knowledge-freshness CI gates._'

  // F-003 round-6: every LLM-controlled scalar that's spliced into the PR
  // body gets `sanitizeLlmField` applied. The Zod schema permits arbitrary
  // strings for `entry_name`/`audit_date`/`model`/`content_hash`/`retrieved_at`,
  // so a verdict containing "\nBREAKING CHANGE:" in any of those would
  // otherwise create a start-of-line footer that deriveBumpKind treats as a
  // real major bump signal. Sanitizing collapses newlines so the rendered
  // body cannot inject a footer regardless of model output.
  return [
    '## Summary',
    `Grounded audit of ${sanitizeLlmField(verdict.entry_name)}.md against:`,
    sourceList,
    '',
    '## Verdict',
    `- verdict: ${sanitizeLlmField(verdict.verdict)}`,
    `- audit_date: ${sanitizeLlmField(verdict.audit_date)}`,
    `- model: ${sanitizeLlmField(verdict.model)}`,
    '',
    '## Findings',
    renderFindingsTable(verdict),
    '',
    '## MMR',
    mmrLine,
    '',
    '## Sources',
    provenance,
    '',
    '## Preserve warnings',
    preserveSection,
    '',
  ].join('\n')
}

/** UTC YYYY-MM-DD for branch naming. Separate so tests can pin the date. */
export function todayUtcYmd(now: Date = new Date()): string {
  const y = now.getUTCFullYear().toString().padStart(4, '0')
  const m = (now.getUTCMonth() + 1).toString().padStart(2, '0')
  const d = now.getUTCDate().toString().padStart(2, '0')
  return `${y}-${m}-${d}`
}

/**
 * Sanitize an entry name for use as a git branch component. We never
 * interpolate raw user-controlled strings into a shell command, but the
 * entry name does become a branch ref — disallow whitespace, slashes
 * (already a path separator in the prefix), and non-ascii. The on-disk
 * entry names in `content/knowledge/*` are all kebab-case ASCII so this
 * is a safety net, not a transformation.
 */
export function sanitizeForBranch(entryName: string): string {
  const cleaned = entryName.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '')
  if (cleaned.length === 0) throw new Error(`entry name "${entryName}" sanitized to empty string`)
  return cleaned
}

export function branchNameForEntry(entryName: string, ymd: string): string {
  return `knowledge-freshness/${sanitizeForBranch(entryName)}-${ymd}`
}

export function renderFreshnessPr(verdict: AuditVerdict, opts: RenderPrOptions = {}): RenderedPr {
  return {
    title: renderPrTitle(verdict),
    body: renderPrBody(verdict, opts),
    entryName: verdict.entry_name,
  }
}

/** Volatility-tier → PR label mapping. Used for triage/filtering. */
export function volatilityLabel(volatility: string | undefined): string | undefined {
  switch (volatility) {
  case 'fast-moving': return 'volatility:fast-moving'
  case 'evolving': return 'volatility:evolving'
  case 'stable': return 'volatility:stable'
  default: return undefined
  }
}

// ---------------------------------------------------------------------------
// Side-effect surface: git + gh. Tests use the renderers above; integration
// runs this end-to-end. Kept colocated so the prose contract is one read.
// ---------------------------------------------------------------------------

export interface OpenPrOptions {
  /** Path to the audited entry .md (already updated on disk). */
  entryPath: string
  /** Volatility from the entry frontmatter; used to derive the volatility label. */
  volatility: string | undefined
  /** Optional MMR job ID. */
  mmrJobId?: string
  /** Override the date used for the branch suffix (tests). */
  now?: Date
}

/**
 * Run a subprocess synchronously and throw on non-zero exit. Captures stdout
 * + stderr in the thrown error so failures surface a useful message rather
 * than a bare exit code.
 */
function runOrThrow(cmd: string, args: string[]): string {
  const result = spawnSync(cmd, args, { encoding: 'utf8' })
  if (result.status !== 0) {
    const stderr = result.stderr?.trim() ?? ''
    const stdout = result.stdout?.trim() ?? ''
    throw new Error(
      `command failed: ${cmd} ${args.join(' ')} (exit ${result.status})\n` +
      (stdout ? `stdout: ${stdout}\n` : '') +
      (stderr ? `stderr: ${stderr}` : ''),
    )
  }
  return result.stdout ?? ''
}

/**
 * Open a freshness PR. Pre-conditions:
 *   - The on-disk entry at `entryPath` already has the verdict applied.
 *   - The git working tree must show ONLY `entryPath` as modified (no other
 *     unrelated changes). This is a safety guard so a manual run can't
 *     accidentally sweep in unrelated work.
 *   - `gh` CLI is authenticated.
 */
export function openFreshnessPr(verdict: AuditVerdict, opts: OpenPrOptions): { branch: string; prUrl: string } {
  // Working-tree safety. `git status --porcelain` lists changed paths with a
  // 2-char status prefix. We require exactly one entry, and it must be the
  // entry path. Untracked files outside the entry path are also disallowed —
  // they'd be carried along by `git add <entryPath>` only if the path matches,
  // but a porcelain check is the cleanest precondition.
  const porcelain = runOrThrow('git', ['status', '--porcelain']).split('\n').filter((l) => l.length > 0)
  // Path normalization (round-4 F-001 + round-9 F-002): `git status
  // --porcelain` outputs paths relative to the GIT REPOSITORY ROOT.
  // `opts.entryPath` can be:
  //   - absolute → path.resolve is a no-op
  //   - relative to cwd → resolve against process.cwd()
  // Always resolve porcelain output against the repo root.
  const repoRoot = runOrThrow('git', ['rev-parse', '--show-toplevel']).trim()
  const targetEntry = path.resolve(process.cwd(), opts.entryPath)
  const relevant = porcelain.filter((line) => {
    // Tolerate any 2-char status (M, A, D, ??, etc.); we just need the path.
    const filePath = line.slice(3).trim()
    return path.resolve(repoRoot, filePath) === targetEntry
  })
  if (porcelain.length === 0) {
    throw new Error('refusing to open PR: working tree has no changes (did you forget to apply the verdict?)')
  }
  if (porcelain.length !== relevant.length) {
    const offenders = porcelain.filter((l) => !relevant.includes(l)).map((l) => l.slice(3).trim())
    throw new Error(
      `refusing to open PR: working tree has unrelated changes:\n${offenders.map((o) => `  - ${o}`).join('\n')}\n` +
      'Commit/stash unrelated changes before running --open-pr.',
    )
  }

  const ymd = todayUtcYmd(opts.now)
  const branch = branchNameForEntry(verdict.entry_name, ymd)
  const rendered = renderFreshnessPr(verdict, { mmrJobId: opts.mmrJobId })

  // Branch off main so the PR is against the same base regardless of which
  // local branch the operator was on. `-C` forcefully creates or resets the
  // branch — needed for re-runs on the same date (workflow_dispatch retry
  // after a cron failure), where `-c` would fail because the branch already
  // exists. F-001.
  runOrThrow('git', ['fetch', 'origin', 'main'])
  runOrThrow('git', ['switch', '-C', branch, 'origin/main'])

  // Re-stage the file. After switching branches, the file's working-tree
  // contents are preserved (since the change wasn't committed), but the
  // index gets reset; `git add` re-stages explicitly.
  runOrThrow('git', ['add', '--', opts.entryPath])

  // Conventional-commits commit. We pass the body via stdin (-F -) so the
  // multi-line body survives shell quoting.
  const commitMsg = `${rendered.title}\n\n${rendered.body}`
  const commit = spawnSync('git', ['commit', '-F', '-'], { input: commitMsg, encoding: 'utf8' })
  if (commit.status !== 0) {
    throw new Error(
      `git commit failed (exit ${commit.status})\nstdout: ${commit.stdout}\nstderr: ${commit.stderr}`,
    )
  }

  // Force-push so re-runs on the same date overwrite the prior bot-run
  // branch state instead of erroring (F-002 + F-001 follow-through). This
  // is safe because branches under `knowledge-freshness/*` are bot-owned;
  // human edits live on other branches.
  runOrThrow('git', ['push', '--force-with-lease', '-u', 'origin', branch])

  // If a PR already exists for this branch, UPDATE it instead of trying to
  // create a new one (F-002). gh pr create errors when a PR is already open
  // for the head ref, which would crash the daily cron on retry.
  const existingPrList = spawnSync(
    'gh',
    ['pr', 'list', '--head', branch, '--state', 'open', '--json', 'number,url'],
    { encoding: 'utf8' },
  )
  let prUrl = ''
  if (existingPrList.status === 0) {
    try {
      const parsed = JSON.parse(existingPrList.stdout || '[]') as Array<{ number: number; url: string }>
      if (parsed.length > 0) {
        const existing = parsed[0]
        // Update title + body on the existing PR via `gh pr edit`.
        const editResult = spawnSync(
          'gh',
          ['pr', 'edit', String(existing.number), '--title', rendered.title, '--body', rendered.body],
          { encoding: 'utf8' },
        )
        if (editResult.status !== 0) {
          throw new Error(
            `gh pr edit failed (exit ${editResult.status})\nstdout: ${editResult.stdout}\nstderr: ${editResult.stderr}`,
          )
        }
        prUrl = existing.url
      }
    } catch (err) {
      throw new Error(`failed to parse gh pr list output: ${(err as Error).message}`)
    }
  }

  if (!prUrl) {
    // No existing PR — open a new one. Labels are best-effort and added below.
    const ghArgs = [
      'pr', 'create', '--base', 'main', '--head', branch,
      '--title', rendered.title, '--body', rendered.body,
    ]
    const ghResult = spawnSync('gh', ghArgs, { encoding: 'utf8' })
    if (ghResult.status !== 0) {
      throw new Error(
        `gh pr create failed (exit ${ghResult.status})\nstdout: ${ghResult.stdout}\nstderr: ${ghResult.stderr}`,
      )
    }
    prUrl = (ghResult.stdout ?? '').trim().split('\n').pop() ?? ''
  }

  // Best-effort label attachment. `gh pr edit --add-label` will create
  // the labels in the repo on first use only if they exist; the workflow's
  // first manual dispatch should seed them. We swallow errors so a missing
  // label doesn't fail the PR.
  const labels = ['knowledge-freshness']
  const volLabel = volatilityLabel(opts.volatility)
  if (volLabel) labels.push(volLabel)
  const labelArgs = ['pr', 'edit', prUrl, ...labels.flatMap((l) => ['--add-label', l])]
  const labelResult = spawnSync('gh', labelArgs, { encoding: 'utf8' })
  if (labelResult.status !== 0) {
    process.stderr.write(
      `warning: failed to attach labels (${labels.join(', ')}): ${labelResult.stderr?.trim()}\n`,
    )
  }

  return { branch, prUrl }
}

/**
 * Extract `volatility` from an entry's frontmatter. We can't import the
 * knowledge-loader here because it pulls in the full assembly stack;
 * a minimal yaml-only read keeps this surface lean.
 */
export function readVolatility(entryContent: string): string | undefined {
  // F-004 round-4: tolerate optional UTF-8 BOM (U+FEFF) and CRLF line
  // endings. The strict /^---\n.../ regex would silently miss-match a
  // file authored on Windows or with a BOM, leaving the PR without its
  // volatility label. We strip a leading BOM defensively, then match
  // both LF and CRLF line endings via \r?\n.
  const BOM = '﻿'
  const noBom = entryContent.startsWith(BOM) ? entryContent.slice(BOM.length) : entryContent
  const match = noBom.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (!match) return undefined
  const fm = yaml.load(match[1], { schema: yaml.JSON_SCHEMA }) as { volatility?: string }
  return fm?.volatility
}
