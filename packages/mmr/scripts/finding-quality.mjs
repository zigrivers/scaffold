#!/usr/bin/env node
/**
 * Finding-quality harness.
 *
 * Measures whether a change to MMR's review prompts reduces *low-value*
 * findings, as opposed to reducing findings — a different and much easier
 * thing to achieve by lowering the bar.
 *
 * Necessary because a single before/after comparison does not work: two
 * consecutive baseline runs of the same PR through the same channels, with no
 * configuration change at all, returned 4 findings and then 1. Anything smaller
 * than that swing is resampling, not signal.
 *
 * The rubric lives in ./finding-quality-rubric.md and is fixed before scoring.
 *
 * The unit of analysis is MMR's **reconciled** findings — the list a user
 * actually sees and the verdict actually gates on. Scoring raw per-channel
 * findings would weight every rate by channel redundancy, counting one defect
 * three times when three channels report it.
 *
 *   # 0. selftest — verify the harness's own math before trusting a verdict
 *   node scripts/finding-quality.mjs selftest
 *
 *   # 1. collect — N runs of one condition (N >= 6; the rubric's floor).
 *   #    NOTE: with --config, the repo-root .mmr.yaml is REPLACED for the
 *   #    duration of the run and restored afterwards. Do not edit it while a
 *   #    collection is in flight — the restore would overwrite your changes.
 *   node scripts/finding-quality.mjs collect \
 *     --out runs/baseline --pr 782 --n 6 --channels claude,codex,opencode-glm
 *
 *   node scripts/finding-quality.mjs collect \
 *     --out runs/calibrated --pr 782 --n 6 --channels claude,codex,opencode-glm \
 *     --config ./candidate.mmr.yaml
 *
 *   # 2. score — pools both arms, shuffles, judges blind to condition.
 *   #    Roles are explicit: the direction of the comparison must never depend
 *   #    on argument order.
 *   node scripts/finding-quality.mjs score \
 *     --baseline runs/baseline --candidate runs/calibrated
 *
 *   # 3. report — rates per arm, against the rubric's ship/revert rule
 *   node scripts/finding-quality.mjs report \
 *     --baseline runs/baseline --candidate runs/calibrated
 */

import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const MMR = path.resolve(HERE, '../dist/index.js')
const RUBRIC = path.join(HERE, 'finding-quality-rubric.md')

const CLASSES = ['defect', 'speculative', 'deletion', 'hygiene', 'artifact']
/** The only filenames collect ever creates — and so the only ones it may delete. */
const RUN_FILE_RE = /^run-\d{2,}\.json$/
/** Provenance sidecar written by collect; not a run file, but harness-owned. */
const PROVENANCE_FILE = 'provenance.json'
/** The pinned diff every run in a condition reviews. Also harness-owned. */
const SNAPSHOT_FILE = 'reviewed.diff'

function sha256(text) {
  return createHash('sha256').update(text).digest('hex').slice(0, 16)
}

/**
 * Digest of every runtime artifact, not just the entry point. dist/index.js is
 * a few imports; all the behaviour that shapes a review lives in the files it
 * pulls in and in the prompt templates, so hashing it alone would call two
 * materially different builds identical.
 */
function buildDigest() {
  const roots = [path.resolve(HERE, '../dist'), path.resolve(HERE, '../templates')]
  const parts = []
  const walk = (dir) => {
    if (!fs.existsSync(dir)) return
    for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (/\.(js|mjs|cjs|md|json)$/.test(entry.name)) {
        parts.push(`${path.relative(path.resolve(HERE, '..'), full)}:${sha256(fs.readFileSync(full, 'utf-8'))}`)
      }
    }
  }
  for (const r of roots) walk(r)
  return sha256(parts.join('\n'))
}
/** The rubric's floor. Below this, run-to-run variance dominates any effect. */
const MIN_RUNS = 6
/** Fixed so a scoring pass is reproducible, and so `report` can re-derive it. */
const SHUFFLE_SEED = 20260731

function parseArgs(argv) {
  const out = { _: [] }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (!a.startsWith('--')) { out._.push(a); continue }
    // --flag=value, not only --flag value. Without this the whole token became
    // a key and the real flag read as missing — so `--config=x` silently ran a
    // baseline collection while the caller believed they had set a treatment.
    const eq = a.indexOf('=')
    if (eq !== -1) {
      const key = a.slice(2, eq)
      const val = a.slice(eq + 1)
      if (val === '') die(`--${key} was given an empty value`)
      out[key] = val
      continue
    }
    const next = argv[i + 1]
    // A flag followed by another flag, or by nothing, is a boolean.
    out[a.slice(2)] = next === undefined || next.startsWith('--') ? true : argv[++i]
  }
  return out
}

/**
 * Full schema check for one judge entry. Shared so `report` applies exactly the
 * checks `score` did: re-validating on read matters because a hand-edited
 * scores file with a missing worth_fixing_now would otherwise read as `false`
 * via `!undefined` and silently inflate the low-value rate.
 *
 * Returns a problem description, or null when the entry is valid.
 */
function validateScoreEntry(s) {
  if (!s || typeof s !== 'object') return 'is not an object'
  if (!CLASSES.includes(s.class)) return `has invalid class ${JSON.stringify(s.class)}`
  if (typeof s.names_path !== 'boolean') return 'names_path must be a boolean'
  if (typeof s.worth_fixing_now !== 'boolean') return 'worth_fixing_now must be a boolean'
  if (typeof s.why !== 'string' || s.why.trim() === '') return 'why must be a non-empty string'
  return contradicts(s)
}

/**
 * The rubric ties `class` and `names_path` together: `speculative` means no
 * path was named, and `defect` requires one (a trust boundary counts as its own
 * path). A judge returning either combination has misapplied the rubric, and
 * both corrupt the speculative rate and the defect count.
 *
 * Returns a description of the contradiction, or null when consistent.
 */
function contradicts(s) {
  if (s.class === 'speculative' && s.names_path === true) {
    return 'classed speculative but names_path is true'
  }
  if (s.class === 'defect' && s.names_path === false) {
    return 'classed defect but names_path is false'
  }
  return null
}

/**
 * First balanced JSON array in the text.
 *
 * A greedy /\[[\s\S]*\]/ runs to the LAST `]` in the output, so any trailing
 * prose containing one swallows it into the match and turns a recoverable
 * result into a parse failure.
 */
function firstJsonArray(text) {
  const start = text.indexOf('[')
  if (start === -1) return null
  let depth = 0
  let inString = false
  let escaped = false
  for (let i = start; i < text.length; i++) {
    const ch = text[i]
    if (inString) {
      if (escaped) escaped = false
      else if (ch === '\\') escaped = true
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') inString = true
    else if (ch === '[') depth++
    else if (ch === ']') {
      depth--
      if (depth === 0) return text.slice(start, i + 1)
    }
  }
  return null
}

/**
 * Keys a candidate config may set.
 *
 * The harness measures a PROMPT change. A config that also altered a channel's
 * command, model, flags, timeout, or parser would change how the review runs as
 * well as what it asks, and every precondition in report would still pass —
 * attributing an execution difference to the prompt. Rather than trying to
 * digest resolved channel settings, refuse the config outright.
 */
const PROMPT_ONLY_KEYS = ['version', 'review_criteria', 'templates']

function assertPromptOnlyConfig(file) {
  let text
  try {
    text = fs.readFileSync(file, 'utf-8')
  } catch (err) {
    die(`could not read ${file}: ${err.message}`)
  }
  // Top-level YAML keys, without taking a parser dependency for one check.
  const keys = [...text.matchAll(/^([A-Za-z_][\w-]*):/gm)].map((m) => m[1])
  const offending = [...new Set(keys)].filter((k) => !PROMPT_ONLY_KEYS.includes(k))
  if (offending.length > 0) {
    die(`${file} sets ${offending.join(', ')}. A candidate may only set `
      + `${PROMPT_ONLY_KEYS.join(', ')} — anything else changes how the review runs, not just `
      + 'what it asks, and the harness would report that as a prompt effect.')
  }
}

/** Flags that must carry a value; `true` here means the value was swallowed. */
const VALUE_FLAGS = ['out', 'config', 'pr', 'diff', 'channels', 'n', 'judge', 'scores', 'baseline', 'candidate']

/**
 * A value-carrying flag immediately followed by another flag parses as `true`,
 * which then reaches path.resolve() or readFileSync() as a boolean and throws
 * an uncaught TypeError naming nothing useful.
 */
function requireValues(args) {
  for (const k of VALUE_FLAGS) {
    if (k in args && typeof args[k] !== 'string') die(`--${k} needs a value`)
  }
  return args
}

function die(msg) {
  console.error(`error: ${msg}`)
  process.exit(1)
}

/**
 * Deterministic shuffle. Math.random would make a scoring pass unreproducible,
 * which matters when a disputed result has to be re-derived later.
 */
function shuffle(items, seed) {
  const arr = [...items]
  let s = seed >>> 0
  for (let i = arr.length - 1; i > 0; i--) {
    s = (Math.imul(s, 1103515245) + 12345) >>> 0
    const j = (s >>> 1) % (i + 1)
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

/** Stable, collision-resistant identity for a condition directory. */
function conditionId(dir) {
  return path.resolve(dir)
}

function conditionLabel(dir) {
  return path.basename(path.resolve(dir))
}

// ---------------------------------------------------------------- collect

/**
 * The one piece of the harness that mutates a file outside its own output
 * directory: the repo-root .mmr.yaml.
 *
 * Extracted because it has been the source of three separate defects — a
 * signal arriving before the backup existed, a `finally` skipped by
 * process.exit, and a partial copy leaving the destination truncated. Hand
 * tracing kept missing one; a factory can be driven by the selftest.
 *
 * `restore()` is idempotent and inert until `install()` has actually run, so it
 * is safe to call from a finally, a signal handler, and an exit hook at once.
 */
function makeConfigSwapper(livePath, candidatePath, io = fs) {
  let original = null
  let installed = false
  let restored = false
  return {
    install() {
      if (io.existsSync(livePath)) original = io.readFileSync(livePath, 'utf-8')
      // Set BEFORE the copy: a copy that fails partway has still modified the
      // destination, and restore must know to undo it.
      installed = true
      io.copyFileSync(candidatePath, livePath)
    },
    restore() {
      if (!installed || restored) return
      restored = true
      if (original !== null) io.writeFileSync(livePath, original)
      else io.rmSync(livePath, { force: true })
    },
    get installed() { return installed },
  }
}

/**
 * Map every channel in --dry-run output to its assembled prompt, with the diff
 * payload removed.
 *
 * The diff is identical across arms by construction (both review the same
 * snapshot) and would otherwise dominate the digest. Everything else — the core
 * prompt, project criteria, focus, and any per-channel wrapper that follows the
 * diff — is treatment and must be included.
 */
function canonicalPrompts(dryRunOutput) {
  const marker = /^--- Assembled prompt for (.+) ---$/gm
  const hits = [...dryRunOutput.matchAll(marker)]
  if (hits.length === 0) return null
  const out = {}
  for (let i = 0; i < hits.length; i++) {
    const channel = hits[i][1].trim()
    const from = hits[i].index + hits[i][0].length
    const to = i + 1 < hits.length ? hits[i + 1].index : dryRunOutput.length
    // Remove the fenced diff block wherever it sits, rather than truncating at
    // it, so anything after it still counts.
    out[channel] = dryRunOutput.slice(from, to).replace(/## Diff\n```diff\n[\s\S]*?\n```/g, '## Diff <elided>')
  }
  return JSON.stringify(Object.keys(out).sort().map((k) => [k, out[k]]))
}

/** Canonical channel-list form, so two spellings of one set never differ. */
function normalizeChannels(list) {
  return list.split(',').map((c) => c.trim()).filter(Boolean).sort().join(',')
}

function collect(args) {
  // Absolute from here on. The MMR child runs with cwd=repoRoot, so a relative
  // --out would hand it a --diff path resolved against the repo root instead of
  // the caller's directory — which silently breaks every invocation made from
  // packages/mmr, including the ones this file documents.
  const outDir = args.out ? path.resolve(args.out) : die('--out required')
  const n = Number(args.n ?? MIN_RUNS)
  const channels = args.channels ?? die('--channels required')
  if (!args.pr && !args.diff) die('--pr or --diff required')
  if (!Number.isInteger(n) || n < 1) die('--n must be a positive integer')
  if (n < MIN_RUNS) {
    console.error(`warning: --n ${n} is below the rubric's floor of ${MIN_RUNS};`
      + ' report will refuse to issue a verdict')
  }

  // A directory that already holds runs would silently mix a previous
  // experiment into this one — a shorter rerun leaves the old tail behind, and
  // the extra runs are indistinguishable from the new ones once pooled.
  if (fs.existsSync(outDir)) {
    const entries = fs.readdirSync(outDir)
    const harnessOwned = (f) => RUN_FILE_RE.test(f) || f === PROVENANCE_FILE || f === SNAPSHOT_FILE
    const stale = entries.filter(harnessOwned)
    // --force must never be a directory shredder. A mistyped --out pointing at
    // a real directory would otherwise delete its contents, so only files
    // matching the run-NN.json names this harness itself writes are removable,
    // and any other content makes the directory off-limits entirely.
    const foreign = entries.filter((f) => !harnessOwned(f))
    if (foreign.length > 0) {
      die(`${outDir} contains ${foreign.length} file(s) this harness did not write `
        + `(e.g. ${foreign.slice(0, 3).join(', ')}). Refusing to use it — pick an empty or harness-owned directory.`)
    }
    if (stale.length > 0 && args.force !== true) {
      die(`${outDir} already contains ${stale.length} run file(s). `
        + 'Use a fresh directory, or pass --force to clear it.')
    }
    for (const f of stale) fs.rmSync(path.join(outDir, f))
  }
  fs.mkdirSync(outDir, { recursive: true })

  // Without this, an unbuilt package surfaces only as N repetitions of
  // "FAILED (no JSON)" — the broad catch below hides the real cause.
  if (!fs.existsSync(MMR)) {
    die(`${MMR} not found — run \`npm run build\` in packages/mmr first.`)
  }

  // A candidate config is applied by copying it to the repo root as .mmr.yaml
  // and reviewing with --trust-project-config. Doing it via the working tree
  // (rather than committing it) keeps the experiment off the branch under test.
  const repoRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf-8' }).trim()
  const liveConfig = path.join(repoRoot, '.mmr.yaml')
  if (args.config) assertPromptOnlyConfig(path.resolve(args.config))
  if (args.config && path.resolve(args.config) === liveConfig) {
    die('--config is the repo-root .mmr.yaml itself. collect replaces that file for the '
      + 'duration of the run, so the candidate must be a separate file.')
  }
  // The repo-root config is a single shared resource. Two configured
  // collections would swap and restore it in interleaved order, leaving one
  // arm reviewed under the other's config and possibly the candidate left
  // installed. mkdir is atomic, so it is the whole lock.
  const lockDir = path.join(repoRoot, '.mmr-harness.lock')
  let holdsLock = false
  if (args.config) {
    try {
      fs.mkdirSync(lockDir)
      holdsLock = true
    } catch {
      die(`another configured collection holds ${lockDir}. Wait for it to finish, or remove `
        + 'that directory if no collection is running.')
    }
  }
  const releaseLock = () => {
    if (!holdsLock) return
    holdsLock = false
    try { fs.rmdirSync(lockDir) } catch { /* already gone */ }
  }

  const swapper = args.config ? makeConfigSwapper(liveConfig, path.resolve(args.config)) : null
  // Inert until install() has run, so a signal arriving before then cannot
  // delete a .mmr.yaml the harness never touched.
  const restoreConfig = () => { swapper?.restore(); releaseLock() }
  // A `finally` does not run on SIGINT/SIGTERM, and a collect run takes long
  // enough that Ctrl-C during it is the common case — leaving the candidate
  // config sitting at the repo root, where it would silently apply to the
  // user's next review.
  const onSignal = (sig) => {
    restoreConfig()
    process.exit(sig === 'SIGINT' ? 130 : 143)
  }
  process.once('SIGINT', () => onSignal('SIGINT'))
  process.once('SIGTERM', () => onSignal('SIGTERM'))
  // die() calls process.exit(), which does NOT unwind the stack — so a `finally`
  // inside collect is skipped whenever a run fails, leaving the candidate config
  // live at the repo root. An 'exit' hook runs in every one of those paths, and
  // restoreConfig is idempotent, so this is the backstop that makes the
  // try/finally and the signal handlers merely the fast paths.
  process.once('exit', restoreConfig)



  // Record what was actually reviewed. Without this, two arms can review
  // different code — a PR that gained a commit between runs, a rebuilt MMR, a
  // different channel set — and report would attribute the difference to the
  // prompt. Everything here except configDigest must match across arms;
  // configDigest IS the treatment, so it is expected to differ.
  let reviewedDiff
  try {
    reviewedDiff = args.pr
      ? execFileSync('gh', ['pr', 'diff', String(args.pr)], { encoding: 'utf-8', maxBuffer: 64 * 1024 * 1024 })
      : fs.readFileSync(path.resolve(args.diff), 'utf-8')
  } catch (err) {
    die(args.pr
      ? `could not fetch the diff for PR ${args.pr}: ${err.message}`
      : `could not read ${path.resolve(args.diff)}: ${err.message}`)
  }
  const provenanceBase = {
    target: args.pr ? `pr:${args.pr}` : `diff:${path.basename(path.resolve(args.diff))}`,
    diffDigest: sha256(reviewedDiff),
    channels: normalizeChannels(channels),
    mmrDigest: buildDigest(),
    repoCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf-8' }).trim(),
  }

  // Every run reviews this exact snapshot rather than re-resolving --pr each
  // time. A PR that gains a commit mid-collection would otherwise have runs
  // within one condition reviewing different code, with nothing to detect it —
  // and the two arms are collected minutes apart, so this is not hypothetical.
  const snapshot = path.join(outDir, SNAPSHOT_FILE)
  fs.writeFileSync(snapshot, reviewedDiff)

  const base = ['review', '--channels', channels, '--sync', '--format', 'json', '--diff', snapshot]
  // --diff is untrusted-head, so the candidate arm needs the explicit opt-in to
  // have its .mmr.yaml read at all. The baseline arm wants no project config,
  // which is what untrusted-head already gives it.
  if (args.config) base.push('--trust-project-config')

  try {
    // Installed INSIDE the try, and marked installed before the copy: a
    // copyFileSync that fails after truncating the destination has still
    // modified the repo root, so the finally must restore it. Everything that
    // can fail without touching the repo root — gh pr diff, git, provenance —
    // has already run above.
    swapper?.install()

    // The treatment IS the prompt the channels receive, so record that, not a
    // proxy for it. A config digest — however canonicalized — can differ while
    // the assembled prompt is identical (a setting restated at its default, a
    // value a CLI flag overrides), which would let two identical treatments be
    // compared against each other and let resampling alone earn a ship verdict.
    // --dry-run assembles and prints the real thing without dispatching.
    let dryRun
    try {
      dryRun = execFileSync('node', [MMR, ...base, '--dry-run'], {
        encoding: 'utf-8', maxBuffer: 64 * 1024 * 1024, cwd: repoRoot,
      })
    } catch (err) {
      die(`could not assemble the prompt for this condition: ${(err.stderr || err.message || '').toString().slice(0, 300)}`)
    }
    // Digest EVERY channel's assembled prompt, keyed by channel. Splitting at
    // the first "## Diff" hashed a prefix of the first channel only, so a
    // wrapper suffix, a later channel's criteria, or a difference in any
    // channel but the first was invisible.
    const promptOnly = canonicalPrompts(dryRun)
    if (promptOnly === null) die('could not parse --dry-run output into per-channel prompts')
    // Written incomplete first. An interrupted collection leaves its finished
    // runs on disk, and with --n above the floor report would otherwise see
    // enough of them to call a truncated condition complete and issue a verdict
    // from it.
    const provenance = {
      ...provenanceBase,
      promptDigest: sha256(promptOnly),
      requestedRuns: n,
      complete: false,
    }
    const provPath = path.join(outDir, PROVENANCE_FILE)
    fs.writeFileSync(provPath, JSON.stringify(provenance, null, 2))

    // Width from N, so lexicographic sort stays chronological past 99 runs
    // (run-100 would otherwise sort before run-11).
    const padWidth = Math.max(2, String(n).length)
    // Serial, never parallel: concurrent same-account sessions are exactly the
    // condition that makes grok return a cancelled envelope, and a channel that
    // degrades in one arm and not the other silently biases the comparison.
    for (let i = 1; i <= n; i++) {
      const target = path.join(outDir, `run-${String(i).padStart(padWidth, '0')}.json`)
      fs.rmSync(target, { force: true })
      process.stderr.write(`[${conditionLabel(outDir)}] run ${i}/${n} … `)
      const started = Date.now()
      let raw
      try {
        raw = execFileSync('node', [MMR, ...base], {
          encoding: 'utf-8',
          maxBuffer: 64 * 1024 * 1024,
          cwd: repoRoot,
        })
      } catch (err) {
        // mmr exits 2 on `blocked` and 3 on `needs-user-decision`. Both are
        // normal outcomes here — we want the findings, not the verdict. Any
        // other status is a real failure and must not be mistaken for one.
        if (err.status !== 2 && err.status !== 3) {
          process.stderr.write('FAILED\n')
          die(`run ${i} exited ${err.status ?? 'abnormally'}: ${(err.stderr || err.message || '').toString().slice(0, 500)}`)
        }
        raw = err.stdout ?? ''
      }
      const secs = ((Date.now() - started) / 1000).toFixed(0)
      let parsed
      try {
        parsed = JSON.parse(raw)
      } catch {
        // Skipping would leave a condition that looks complete while quietly
        // missing an attempt — and with --n above the floor, report would still
        // see enough runs to issue a verdict. An experiment with a hole in it
        // is not an experiment; re-collect instead.
        process.stderr.write(`FAILED (no JSON) after ${secs}s\n`)
        die(`run ${i} produced no parseable result. Re-run \`collect\` for this condition `
          + '(a partial condition cannot be compared against a complete one).')
      }
      fs.writeFileSync(target, raw)
      const degraded = Object.entries(parsed.per_channel ?? {})
        .filter(([, c]) => c.status !== 'completed')
        .map(([k, c]) => `${k}:${c.status}`)
      // Report the same unit the scorer uses, so the console figure and the
      // scored population cannot drift apart.
      process.stderr.write(
        `${parsed.reconciled_findings?.length ?? 0} reconciled findings, ${secs}s`
        + (degraded.length ? `  DEGRADED ${degraded.join(' ')}` : '') + '\n',
      )
    }
    fs.writeFileSync(provPath, JSON.stringify({ ...provenance, complete: true }, null, 2))
  } finally {
    restoreConfig()
  }
}

/**
 * Load a condition's reconciled findings, one entry per run.
 *
 * Reconciled — not per-channel — because that is MMR's actual output and what
 * the verdict gates on. Pooling per-channel findings would count a defect once
 * per channel that reported it, making every rate a function of how much the
 * channels happened to agree.
 */
function loadCondition(dir) {
  const id = conditionId(dir)
  if (!fs.existsSync(dir)) die(`condition directory not found: ${dir}`)
  const findings = []
  const runs = []
  let provenance = null
  const provPath = path.join(dir, PROVENANCE_FILE)
  if (fs.existsSync(provPath)) {
    try {
      provenance = JSON.parse(fs.readFileSync(provPath, 'utf-8'))
    } catch {
      die(`${provPath} is not readable JSON — re-run \`collect\` for this condition`)
    }
  }
  for (const f of fs.readdirSync(dir).filter((x) => RUN_FILE_RE.test(x)).sort()) {
    // A corrupt or foreign file should name itself, not surface as a bare
    // stack trace from deep inside the scorer.
    let r
    try {
      r = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf-8'))
    } catch (err) {
      die(`${path.join(dir, f)} is not readable JSON: ${err.message}`)
    }
    if (!Array.isArray(r?.reconciled_findings) || typeof r?.per_channel !== 'object' || r.per_channel === null) {
      die(`${path.join(dir, f)} is not an MMR run result (missing reconciled_findings / per_channel)`)
    }
    const degraded = Object.entries(r.per_channel ?? {})
      .filter(([, c]) => c.status !== 'completed')
      .map(([k]) => k)
    const completed = Object.entries(r.per_channel ?? {})
      .filter(([, c]) => c.status === 'completed')
      .map(([k]) => k)
      .sort()
    for (const x of r.reconciled_findings ?? []) {
      findings.push({
        condition: id,
        run: f,
        severity: x.severity,
        location: x.location,
        description: x.description,
        suggestion: x.suggestion,
      })
    }
    runs.push({
      run: f,
      total: (r.reconciled_findings ?? []).length,
      degraded,
      coverage: completed.join(','),
      dispatched: Object.keys(r.per_channel).sort().join(','),
    })
  }
  // Hash the finding payloads, not just their count: re-collecting the same
  // number of runs with the same number of findings must not pass a manifest
  // check when every finding changed.
  // Covers the findings AND everything report reads about the runs: a change
  // to channel status, coverage, or the provenance would otherwise slip past a
  // findings-only digest while report used scores from the older shape.
  const digest = sha256(JSON.stringify({
    findings: findings.map((f) => [f.run, f.severity, f.location, f.description, f.suggestion]),
    runs: runs.map((r) => [r.run, r.total, r.degraded.join(','), r.coverage, r.dispatched]),
    provenance,
  }))
  return { id, label: conditionLabel(dir), findings, runs, provenance, digest }
}

/**
 * Load the two arms by ROLE, never by position.
 *
 * A positional list makes the direction of the comparison depend on argument
 * order, so swapping two directories silently turns a regression into an
 * apparent improvement — and the verdict would read exactly the same.
 */
function loadArms(args) {
  const baseDir = args.baseline ?? die('--baseline <dir> required')
  const candDir = args.candidate ?? die('--candidate <dir> required')
  const base = loadCondition(baseDir)
  const cand = loadCondition(candDir)
  if (base.id === cand.id) die('--baseline and --candidate are the same directory')
  return [base, cand]
}

// ------------------------------------------------------------------ score

function score(args) {
  const conditions = loadArms(args)
  const judge = args.judge ?? 'claude'
  const rubric = fs.readFileSync(RUBRIC, 'utf-8')

  const pooled = conditions.flatMap((c) => c.findings)
  if (pooled.length === 0) die('no findings found in the given conditions')

  // Shuffle and re-key so the judge cannot infer the arm from ordering.
  const shuffled = shuffle(pooled, SHUFFLE_SEED).map((f, i) => ({ ...f, id: `F${String(i + 1).padStart(3, '0')}` }))

  const blind = shuffled.map((f) => ({
    id: f.id,
    severity: f.severity,
    location: f.location,
    description: f.description,
    suggestion: f.suggestion,
  }))

  const prompt = [
    'You are scoring code-review findings against a fixed rubric. You do not know which',
    'configuration produced which finding, and you must not speculate about it.',
    '',
    '## Rubric',
    '',
    rubric,
    '',
    '## Findings to score',
    '',
    JSON.stringify(blind, null, 2),
    '',
    '## Output',
    '',
    'Return ONLY a JSON array, one object per finding, no prose and no markdown fences:',
    '[{"id":"F001","class":"<exactly one of: ' + CLASSES.join(', ') + '>",',
    '  "names_path":true|false,"worth_fixing_now":true|false,"why":"one short sentence"}]',
    '',
    `Score every finding — all ${blind.length} of them. Use exactly one class per finding.`,
  ].join('\n')

  // --judge names a binary that must accept `-p` and read the prompt from
  // stdin (Claude Code's print mode). Other CLIs use different flags and will
  // fail here; swapping in codex/opencode needs a full invocation, not a name.
  process.stderr.write(`scoring ${shuffled.length} reconciled findings via \`${judge} -p\` (stdin) …\n`)
  // Fed on stdin, not argv: a large pooled set JSON-stringified into a single
  // argument runs into ARG_MAX (E2BIG) once run counts grow.
  let raw
  try {
    raw = execFileSync(judge, ['-p'], {
      encoding: 'utf-8',
      input: prompt,
      maxBuffer: 64 * 1024 * 1024,
    })
  } catch (err) {
    // `-p` + stdin is Claude Code's print mode. codex and opencode use
    // different flags, so --judge is a choice of Claude-compatible binary, not
    // a general adapter — say so rather than surfacing a spawn stack trace.
    die(`judge \`${judge} -p\` failed: ${err.message}\n`
      + '--judge must name a binary that accepts `-p` and reads the prompt from stdin '
      + '(Claude Code print mode). codex/opencode use different flags and are not drop-in.')
  }
  const match = firstJsonArray(raw)
  if (!match) die(`judge returned no JSON array:\n${raw.slice(0, 500)}`)

  let scores
  try {
    scores = JSON.parse(match)
  } catch (err) {
    die(`judge returned malformed JSON: ${err.message}`)
  }

  // Validate hard rather than warn. A silently dropped or malformed score
  // removes a finding from the denominator, which moves every rate the report
  // prints — the exact failure this harness exists to catch.
  if (!Array.isArray(scores)) die('judge output is not an array')
  const expected = new Set(shuffled.map((f) => f.id))
  const byId = new Map()
  for (const s of scores) {
    if (typeof s?.id !== 'string') die(`score entry has no string id: ${JSON.stringify(s)}`)
    if (!expected.has(s.id)) die(`judge returned an unknown id: ${s.id}`)
    if (byId.has(s.id)) die(`judge returned a duplicate id: ${s.id}`)
    if (!CLASSES.includes(s.class)) die(`${s.id}: invalid class ${JSON.stringify(s.class)}`)
    if (typeof s.names_path !== 'boolean') die(`${s.id}: names_path must be a boolean`)
    if (typeof s.worth_fixing_now !== 'boolean') die(`${s.id}: worth_fixing_now must be a boolean`)
    // The rubric defines these two fields in terms of each other, so a judge
    // that contradicts itself has misread it — and the contradiction lands
    // directly on the two metrics the ship rule reads.
    if (typeof s.why !== 'string' || s.why.trim() === '') {
      die(`${s.id}: why must be a non-empty string`)
    }
    const conflict = contradicts(s)
    if (conflict) die(`${s.id}: ${conflict} — re-run \`score\``)
    byId.set(s.id, s)
  }
  const missing = [...expected].filter((id) => !byId.has(id))
  if (missing.length) die(`judge skipped ${missing.length} finding(s): ${missing.slice(0, 10).join(', ')}`)

  const scored = shuffled.map((f) => ({ ...f, score: byId.get(f.id) }))
  // Bind the scores to the exact runs they came from. Without this, re-running
  // collect between `score` and `report` leaves report mixing fresh run counts
  // read from disk with stale scores read from the file — and still printing a
  // verdict.
  const manifest = {
    // The rubric says amending a category requires re-scoring EVERY condition
    // from scratch. Binding its digest is what makes that enforceable instead
    // of aspirational.
    rubricDigest: sha256(rubric),
    roles: { baseline: conditions[0].id, candidate: conditions[1].id },
    conditions: conditions.map((c) => ({
      id: c.id,
      runs: c.runs.map((r) => r.run).sort(),
      findings: c.findings.length,
      // Content, not just counts: re-collecting the same number of runs with
      // the same number of findings must not pass when every finding changed.
      digest: c.digest,
    })),
  }
  const outPath = args.scores ?? args.out ?? 'finding-quality-scores.json'
  fs.writeFileSync(outPath, JSON.stringify({ manifest, scored }, null, 2))
  process.stderr.write(`wrote ${outPath}\n`)
}

// ----------------------------------------------------------------- report

/** Per-run speculative rate, used to size the noise band. */
function perRunSpecRates(runs, mine) {
  return runs.map((r) => {
    const inRun = mine.filter((f) => f.run === r.run)
    if (inRun.length === 0) return null
    return inRun.filter((f) => f.score.class === 'speculative').length / inRun.length
  }).filter((x) => x !== null)
}

/**
 * Per-run defect counts. The ship rule hinges on the defect total, so its own
 * run-to-run spread has to be visible — otherwise a reader cannot tell a real
 * drop from the same resampling that motivated this harness.
 */
function perRunDefects(runs, mine) {
  return runs.map((r) => mine.filter((f) => f.run === r.run && f.score.class === 'defect').length)
}

function range(xs) {
  return xs.length ? `${Math.min(...xs)}–${Math.max(...xs)}` : 'n/a'
}

function summarize(condition, scored) {
  const mine = scored.filter((f) => f.condition === condition.id && f.score)
  const total = mine.length
  const count = (cls) => mine.filter((f) => f.score.class === cls).length
  const lowValue = mine.filter(
    (f) => f.score.class === 'speculative' || f.score.class === 'artifact' || !f.score.worth_fixing_now,
  ).length
  const totals = condition.runs.map((r) => r.total)
  const coverages = [...new Set(condition.runs.map((r) => r.coverage))]
  return {
    label: condition.label,
    runs: condition.runs.length,
    degradedRuns: condition.runs.filter((r) => r.degraded.length > 0).length,
    coverages,
    findings: total,
    perRun: totals.length ? `${Math.min(...totals)}–${Math.max(...totals)}` : 'n/a',
    emptyRuns: condition.runs.filter((r) => mine.every((f) => f.run !== r.run)).length,
    specRates: perRunSpecRates(condition.runs, mine),
    defectsPerRun: perRunDefects(condition.runs, mine),
    speculativeRate: total ? count('speculative') / total : 0,
    lowValueRate: total ? lowValue / total : 0,
    defects: count('defect'),
    deletions: count('deletion'),
    // Named for what it checks. Real scoring completeness is enforced in
    // `score`, which dies on any unscored finding.
    hasFindings: total > 0,
  }
}

/**
 * The whole ship/revert decision, as a pure function of two summaries.
 *
 * Extracted so `selftest` exercises the code `report` actually runs. A test
 * that re-implements this arithmetic proves only that the copy is correct.
 */
function evaluateVerdict(base, cand, opts = {}) {
  const blockers = []
  for (const r of [base, cand]) {
    if (r.runs < MIN_RUNS) blockers.push(`${r.label} has ${r.runs} run(s), the rubric's floor is ${MIN_RUNS}`)
    if (r.degradedRuns > 0) blockers.push(`${r.label} has ${r.degradedRuns} run(s) with a degraded channel`)
    if (r.coverages.length > 1) blockers.push(`${r.label} has inconsistent channel coverage: ${r.coverages.join(' vs ')}`)
    if (!r.hasFindings) blockers.push(`${r.label} produced no findings at all`)
    // A run with zero findings has no defined speculative rate, so it drops out
    // of the spread that sizes the noise band — making the band narrower than
    // the data warrants and the ship rule easier to clear than it should be.
    if (r.emptyRuns > 0) {
      blockers.push(`${r.label} has ${r.emptyRuns} run(s) with zero findings, whose rate is undefined `
        + 'and would silently shrink the noise band')
    }
  }
  if (base.coverages[0] !== cand.coverages[0]) {
    blockers.push(`channel coverage differs between conditions: ${base.coverages[0]} vs ${cand.coverages[0]}`)
  }
  // defect_count is an absolute total, so unequal N alone can satisfy the guard
  // rail: the arm with more runs simply had more chances to surface a defect.
  if (base.runs !== cand.runs) {
    blockers.push(`run counts differ (${base.label} ${base.runs}, ${cand.label} ${cand.runs}) — `
      + 'the defect guard rail compares absolute totals and needs equal N')
  }
  blockers.push(...(opts.extraBlockers ?? []))
  // Two arms with the same config are the same condition. Any apparent
  // improvement between them is resampling by construction, and a ship verdict
  // would be meaningless.
  if (opts.sameTreatment === true) {
    blockers.push('both conditions used the same config — there is no treatment to measure')
  }

  // The margin is the baseline spread's WIDTH, not its lowest per-run rate.
  // Per-run finding counts here are small enough that a run can return one
  // finding; if it is not speculative, a floor-based rule pins to 0% and
  // nothing can ever ship however good the candidate is.
  const bandLo = base.specRates.length ? Math.min(...base.specRates) : 0
  const bandHi = base.specRates.length ? Math.max(...base.specRates) : 0
  const margin = bandHi - bandLo
  const improvement = base.speculativeRate - cand.speculativeRate
  const outsideBand = improvement > margin
  // outsideBand already subsumes specDown (margin is never negative, so
  // improvement > margin implies improvement > 0). Both are kept because the
  // rubric states them as separate conditions and the report prints them
  // separately — but they are not independent checks.
  const specDown = cand.speculativeRate < base.speculativeRate
  const defectsHeld = cand.defects >= base.defects
  const ship = blockers.length === 0 && specDown && defectsHeld && outsideBand

  return { blockers, bandLo, bandHi, margin, improvement, outsideBand, specDown, defectsHeld, ship }
}

function report(args) {
  const conditions = loadArms(args)
  const scorePath = args.scores ?? args.out ?? 'finding-quality-scores.json'
  if (!fs.existsSync(scorePath)) die(`scores file not found: ${scorePath} (run \`score\` first)`)
  const raw = JSON.parse(fs.readFileSync(scorePath, 'utf-8'))
  if (!raw || !Array.isArray(raw.scored) || !raw.manifest) {
    die(`${scorePath} is not a manifest-bearing scores file — re-run \`score\``)
  }
  const scored = raw.scored

  if (raw.manifest.rubricDigest !== sha256(fs.readFileSync(RUBRIC, 'utf-8'))) {
    die('the rubric has changed since these scores were produced — re-run `score` for '
      + 'every condition (the rubric requires re-scoring all arms, never one)')
  }
  if (raw.manifest.roles?.baseline !== conditions[0].id
    || raw.manifest.roles?.candidate !== conditions[1].id) {
    die('--baseline/--candidate do not match the roles these scores were produced under — '
      + 're-run `score` with the intended roles')
  }

  // Refuse to report against runs the scores were not produced from.
  for (const c of conditions) {
    const m = raw.manifest.conditions.find((x) => x.id === c.id)
    if (!m) die(`${c.label} is not in the scores manifest — re-run \`score\` for these conditions`)
    if (c.digest !== m.digest) {
      die(`${c.label} has changed since scoring — re-run \`score\``)
    }
  }

  // Re-derive the pooled, shuffled, keyed list exactly as `score` built it —
  // the shuffle is seeded, and the inputs were just digest-verified — and
  // require the file to describe that same set. Without this, a scored entry
  // that was edited, duplicated, dropped, or reassigned to another condition
  // changes every rate while all the manifest checks still pass.
  const expectedList = shuffle(conditions.flatMap((c) => c.findings), SHUFFLE_SEED)
    .map((f, i) => ({ ...f, id: `F${String(i + 1).padStart(3, '0')}` }))
  if (scored.length !== expectedList.length) {
    die(`scores file has ${scored.length} entries but the conditions hold ${expectedList.length} findings `
      + '— re-run `score`')
  }
  for (let i = 0; i < expectedList.length; i++) {
    const e = expectedList[i]
    const a = scored[i]
    if (a?.id !== e.id || a?.condition !== e.condition || a?.run !== e.run
      || a?.location !== e.location || a?.description !== e.description) {
      die(`scores file entry ${i + 1} does not match the finding it claims to score — re-run \`score\``)
    }
    const problem = validateScoreEntry(a.score)
    if (problem) die(`scores file entry ${a.id} ${problem} — re-run \`score\``)
  }

  const rows = conditions.map((c) => summarize(c, scored))
  const pct = (x) => `${(x * 100).toFixed(0)}%`

  console.log('')
  console.log('condition      runs  deg  findings  per-run  spec-rate  low-value'
    + '  defects  def/run  deletions')
  for (const r of rows) {
    console.log(
      r.label.slice(0, 14).padEnd(14)
      + String(r.runs).padStart(4)
      + String(r.degradedRuns).padStart(5)
      + String(r.findings).padStart(10)
      + r.perRun.padStart(9)
      + pct(r.speculativeRate).padStart(11)
      + pct(r.lowValueRate).padStart(11)
      + String(r.defects).padStart(9)
      + range(r.defectsPerRun).padStart(9)
      + String(r.deletions).padStart(11),
    )
  }
  console.log('')

  const [base, cand] = rows

  // Everything except the config digest must match: the config IS the treatment.
  const extraBlockers = []
  const bp = conditions[0].provenance
  const cp = conditions[1].provenance
  if (!bp || !cp) {
    extraBlockers.push('a condition has no provenance.json — re-run `collect` so the reviewed '
      + 'diff, channel set, and MMR build are recorded')
  } else {
    for (const [cond, prov] of [[conditions[0], bp], [conditions[1], cp]]) {
      if (prov.complete !== true) {
        extraBlockers.push(`${cond.label} was never finished — re-run \`collect\` for it`)
      } else if (prov.requestedRuns !== cond.runs.length) {
        extraBlockers.push(`${cond.label} holds ${cond.runs.length} run(s) but ${prov.requestedRuns} `
          + 'were requested — re-collect it')
      }
    }
    for (const key of ['target', 'diffDigest', 'mmrDigest', 'repoCommit']) {
      if (JSON.stringify(bp[key]) !== JSON.stringify(cp[key])) {
        extraBlockers.push(`${key} differs between conditions (${bp[key]} vs ${cp[key]}) — `
          + 'the arms did not review the same thing')
      }
    }
    // Compare what was DISPATCHED, not the --channels string. MMR canonicalizes
    // aliases (agy resolves to antigravity) and de-duplicates, so the request
    // string and the result keys legitimately differ and comparing them would
    // block a valid experiment. Every run must dispatch the same set, and both
    // arms must agree — which is the property that actually matters.
    const dispatchSets = new Set()
    for (const cond of [conditions[0], conditions[1]]) {
      const perCond = new Set(cond.runs.map((r) => r.dispatched))
      if (perCond.size > 1) {
        extraBlockers.push(`${cond.label} dispatched different channel sets across its runs `
          + `(${[...perCond].join(' vs ')})`)
      }
      for (const d of perCond) dispatchSets.add(d)
    }
    if (dispatchSets.size > 1) {
      extraBlockers.push(`the arms dispatched different channel sets (${[...dispatchSets].join(' vs ')})`)
    }
  }

  // Identical assembled prompts mean there is no treatment, whatever the
  // configs looked like on disk.
  const sameTreatment = bp !== null && cp !== null && bp.promptDigest === cp.promptDigest
  const v = evaluateVerdict(base, cand, { extraBlockers, sameTreatment })

  if (v.blockers.length > 0) {
    console.log('NO VERDICT — the experiment does not meet the rubric\'s preconditions:')
    for (const b of v.blockers) console.log(`  · ${b}`)
    console.log('')
    console.log('The table above is descriptive only. Fix the above and re-run.')
    console.log('')
    process.exitCode = 1
    return
  }

  // The defect guard rail stays strict — any drop blocks the ship — but the
  // message distinguishes a drop that clears the baseline's own run-to-run
  // defect range from one inside it. Both block; only the first is evidence
  // the change actually suppressed real defects.
  const defectDropPerRun = Math.max(...base.defectsPerRun) - Math.min(...base.defectsPerRun)
  const defectVerdict = v.defectsHeld
    ? 'held'
    : (base.defects - cand.defects) > defectDropPerRun
      ? 'DROPPED beyond the baseline\'s own defect spread — the bar moved, not the noise'
      : 'dropped, but within the baseline\'s own defect spread — inconclusive, and still not shippable'

  console.log(`speculative rate: ${pct(base.speculativeRate)} → ${pct(cand.speculativeRate)}  ${v.specDown ? 'down' : 'NOT down'}`)
  console.log(`improvement ${pct(v.improvement)} vs baseline per-run spread ${pct(v.bandLo)}–${pct(v.bandHi)} `
    + `(width ${pct(v.margin)}) — ${v.outsideBand ? 'clears the noise band' : 'INSIDE the noise band'}`)
  console.log(`defect count:     ${base.defects} → ${cand.defects}  ${defectVerdict}`)
  console.log(`baseline defects per run: ${range(base.defectsPerRun)}`)
  console.log('')
  console.log(v.ship
    ? 'VERDICT: ship — speculative rate fell beyond the noise band and defect count held.'
    : 'VERDICT: revert — the rubric\'s ship rule is not met.')
  console.log('')
  if (!v.ship) process.exitCode = 1
}

// --------------------------------------------------------------- selftest

/**
 * The verdict is one line of boolean math that decides whether a prompt change
 * ships. A silent error there is precisely the failure this harness exists to
 * prevent, so it gets a runnable check.
 */
function selftest() {
  assert.deepEqual(parseArgs(['collect', '--out', 'x', '--n', '6'])._, ['collect'])
  assert.equal(parseArgs(['--out', 'x'])['out'], 'x')
  assert.equal(parseArgs(['--force'])['force'], true)
  assert.equal(parseArgs(['--force', '--out', 'x'])['force'], true)
  assert.equal(parseArgs(['--out', 'x', '--force'])['force'], true)

  // Deterministic across calls, and actually permuting.
  const items = Array.from({ length: 20 }, (_, i) => i)
  assert.deepEqual(shuffle(items, 42), shuffle(items, 42))
  assert.notDeepEqual(shuffle(items, 42), items)
  assert.notDeepEqual(shuffle(items, 42), shuffle(items, 43))
  assert.deepEqual([...shuffle(items, 42)].sort((a, b) => a - b), items)

  // Drive the REAL decision function, not a copy of its arithmetic.
  const cond = (over = {}) => ({
    label: 'x', runs: MIN_RUNS, degradedRuns: 0, coverages: ['a,b'], hasFindings: true,
    emptyRuns: 0, specRates: [0.4, 0.5], speculativeRate: 0.45, defects: 10, ...over,
  })

  // Every combination of the three decision inputs, so the AND cannot silently
  // become an OR. specDown+outsideBand are driven together via the rate.
  for (const specRate of [0.2, 0.44, 0.5]) {
    for (const defects of [10, 9]) {
      const base = cond()
      const cand = cond({ speculativeRate: specRate, defects })
      const v = evaluateVerdict(base, cand)
      const expected = specRate < 0.45 && (0.45 - specRate) > 0.1 && defects >= 10
      assert.equal(v.ship, expected, `verdict wrong for rate ${specRate}, defects ${defects}`)
    }
  }

  // The noise band uses the baseline spread's WIDTH. A floor-based rule
  // degenerates: one baseline run with no speculative finding pins it to 0%
  // and nothing can ever ship.
  assert.equal(evaluateVerdict(cond({ specRates: [0.0, 0.5], speculativeRate: 0.4 }),
    cond({ speculativeRate: 0.3 })).ship, false, 'a 10pt gain must not clear a 50pt spread')
  assert.equal(evaluateVerdict(cond({ specRates: [0.0, 0.0], speculativeRate: 0.3 }),
    cond({ speculativeRate: 0.1 })).ship, true, 'a zero-width spread must not block a real gain')

  // Each precondition blocks on its own.
  assert.equal(evaluateVerdict(cond({ runs: 3 }), cond({ runs: 3, speculativeRate: 0.1 })).ship, false)
  assert.equal(evaluateVerdict(cond(), cond({ degradedRuns: 1, speculativeRate: 0.1 })).ship, false)
  assert.equal(evaluateVerdict(cond(), cond({ emptyRuns: 1, speculativeRate: 0.1 })).ship, false)
  assert.equal(evaluateVerdict(cond(), cond({ runs: MIN_RUNS + 1, speculativeRate: 0.1 })).ship, false)
  assert.equal(evaluateVerdict(cond(), cond({ coverages: ['a'], speculativeRate: 0.1 })).ship, false)
  assert.equal(evaluateVerdict(cond(), cond({ speculativeRate: 0.1 }),
    { extraBlockers: ['diff differs'] }).ship, false)
  assert.equal(evaluateVerdict(cond(), cond({ speculativeRate: 0.1 }),
    { sameTreatment: true }).ship, false)
  // …and the same inputs with nothing wrong do ship, so the above prove the
  // blocker rather than some unrelated failure.
  assert.equal(evaluateVerdict(cond(), cond({ speculativeRate: 0.1 })).ship, true)

  // Rate arithmetic, including the empty-denominator guard.
  const mk = (cls, worth = true) => ({ score: { class: cls, worth_fixing_now: worth } })
  const sample = [mk('speculative'), mk('defect'), mk('artifact'), mk('hygiene', false)]
  const spec = sample.filter((f) => f.score.class === 'speculative').length / sample.length
  const low = sample.filter(
    (f) => f.score.class === 'speculative' || f.score.class === 'artifact' || !f.score.worth_fixing_now,
  ).length / sample.length
  assert.equal(spec, 0.25)
  assert.equal(low, 0.75)

  // Only harness-written filenames are ever deletable.
  assert.equal(RUN_FILE_RE.test('run-01.json'), true)
  assert.equal(RUN_FILE_RE.test('run-123.json'), true)
  assert.equal(RUN_FILE_RE.test('notes.json'), false)
  assert.equal(RUN_FILE_RE.test('run-01.json.bak'), false)
  assert.equal(RUN_FILE_RE.test('.mmr.yaml'), false)

  // The config swapper, driven against a fake fs. Three defects have come from
  // this logic; hand tracing is what let each of them through.
  const fakeFs = (initial) => {
    const files = { ...initial }
    return {
      files,
      existsSync: (p2) => p2 in files,
      readFileSync: (p2) => files[p2],
      writeFileSync: (p2, v) => { files[p2] = v },
      copyFileSync: (a, b) => { files[b] = files[a] },
      rmSync: (p2) => { delete files[p2] },
    }
  }
  // A pre-existing config is put back byte for byte.
  let io2 = fakeFs({ '/live': 'ORIGINAL', '/cand': 'CANDIDATE' })
  let sw = makeConfigSwapper('/live', '/cand', io2)
  sw.install()
  assert.equal(io2.files['/live'], 'CANDIDATE')
  sw.restore()
  assert.equal(io2.files['/live'], 'ORIGINAL')
  // Restore is idempotent — it runs from a finally, a signal handler, and an
  // exit hook, all of which can fire for one interruption.
  sw.restore(); sw.restore()
  assert.equal(io2.files['/live'], 'ORIGINAL')
  // No pre-existing config: the candidate is removed, not left behind.
  io2 = fakeFs({ '/cand': 'CANDIDATE' })
  sw = makeConfigSwapper('/live', '/cand', io2)
  sw.install()
  sw.restore()
  assert.equal('/live' in io2.files, false)
  // Never installed: restore must NOT delete a file the harness did not write.
  io2 = fakeFs({ '/live': 'USERS_OWN', '/cand': 'CANDIDATE' })
  sw = makeConfigSwapper('/live', '/cand', io2)
  sw.restore()
  assert.equal(io2.files['/live'], 'USERS_OWN')
  // A copy that throws partway has still touched the destination, so restore
  // must undo it rather than treating the swap as never having happened.
  io2 = fakeFs({ '/live': 'ORIGINAL', '/cand': 'CANDIDATE' })
  io2.copyFileSync = () => { throw new Error('ENOSPC') }
  sw = makeConfigSwapper('/live', '/cand', io2)
  assert.throws(() => sw.install())
  sw.restore()
  assert.equal(io2.files['/live'], 'ORIGINAL')

  assert.equal(parseArgs(['--config=x.yaml'])['config'], 'x.yaml')
  assert.equal(parseArgs(['--n=6'])['n'], '6')
  assert.equal(parseArgs(['--out=/a/b', '--force'])['out'], '/a/b')

  assert.equal(normalizeChannels('claude, codex'), 'claude,codex')
  assert.equal(normalizeChannels('codex,claude'), normalizeChannels('claude, codex'))
  assert.equal(normalizeChannels('a,,b '), 'a,b')

  // Trailing prose containing a `]` must not swallow the array.
  assert.equal(firstJsonArray('noise [1,2] tail ] more'), '[1,2]')
  assert.equal(firstJsonArray('[{"a":[1]},{"b":2}] trailing'), '[{"a":[1]},{"b":2}]')
  assert.equal(firstJsonArray('[{"s":"]"}] after'), '[{"s":"]"}]')
  assert.equal(firstJsonArray('[{"s":"\\\\"}] x'), '[{"s":"\\\\"}]')
  assert.equal(firstJsonArray('no array here'), null)

  // report re-validates persisted scores with the same checks score applied.
  const okEntry = { class: 'defect', names_path: true, worth_fixing_now: true, why: 'x' }
  assert.equal(validateScoreEntry(okEntry), null)
  assert.equal(validateScoreEntry({ ...okEntry, worth_fixing_now: undefined }) !== null, true)
  assert.equal(validateScoreEntry({ ...okEntry, why: '  ' }) !== null, true)
  assert.equal(validateScoreEntry({ ...okEntry, class: 'nit' }) !== null, true)
  assert.equal(validateScoreEntry(null) !== null, true)

  // A judge contradicting the rubric must be rejected, not averaged in.
  assert.equal(contradicts({ class: 'speculative', names_path: true }) !== null, true)
  assert.equal(contradicts({ class: 'defect', names_path: false }) !== null, true)
  assert.equal(contradicts({ class: 'speculative', names_path: false }), null)
  assert.equal(contradicts({ class: 'defect', names_path: true }), null)
  assert.equal(contradicts({ class: 'hygiene', names_path: false }), null)
  assert.equal(contradicts({ class: 'deletion', names_path: true }), null)

  assert.equal(conditionLabel('/tmp/a/baseline'), 'baseline')
  assert.notEqual(conditionId('/tmp/a/baseline'), conditionId('/tmp/b/baseline'))

  console.log('selftest: all checks passed')
}

const args = requireValues(parseArgs(process.argv.slice(2)))
const cmd = args._[0]
if (cmd === 'collect') collect(args)
else if (cmd === 'score') score(args)
else if (cmd === 'report') report(args)
else if (cmd === 'selftest') selftest()
else {
  console.error('usage: finding-quality.mjs <collect|score|report|selftest> [options]')
  console.error('see the header of this file for examples')
  process.exit(1)
}
