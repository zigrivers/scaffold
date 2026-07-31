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
 *   # 1. collect — N runs of one condition (N >= 6; the rubric's floor)
 *   node scripts/finding-quality.mjs collect \
 *     --out runs/baseline --pr 782 --n 6 --channels claude,codex,opencode-glm
 *
 *   node scripts/finding-quality.mjs collect \
 *     --out runs/calibrated --pr 782 --n 6 --channels claude,codex,opencode-glm \
 *     --config ./candidate.mmr.yaml
 *
 *   # 2. score — pools all conditions, shuffles, judges blind to condition
 *   node scripts/finding-quality.mjs score --conditions runs/baseline,runs/calibrated
 *
 *   # 3. report — rates per condition, against the rubric's ship/revert rule
 *   node scripts/finding-quality.mjs report --conditions runs/baseline,runs/calibrated
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

function parseArgs(argv) {
  const out = { _: [] }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (!a.startsWith('--')) { out._.push(a); continue }
    const next = argv[i + 1]
    // A flag followed by another flag, or by nothing, is a boolean.
    out[a.slice(2)] = next === undefined || next.startsWith('--') ? true : argv[++i]
  }
  return out
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

function collect(args) {
  const outDir = args.out ?? die('--out required')
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
  let restore = null
  let installed = false
  let restored = false
  const restoreConfig = () => {
    // Inert until we have actually replaced the file. The handlers below are
    // registered early on purpose, and without this guard a signal arriving
    // before installation would run the `restore === null` branch and DELETE
    // the user's own .mmr.yaml — destroying config the harness never touched.
    if (!installed || restored) return
    restored = true
    if (restore !== null) fs.writeFileSync(liveConfig, restore)
    else fs.rmSync(liveConfig, { force: true })
  }
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



  // Record what was actually reviewed. Without this, two arms can review
  // different code — a PR that gained a commit between runs, a rebuilt MMR, a
  // different channel set — and report would attribute the difference to the
  // prompt. Everything here except configDigest must match across arms;
  // configDigest IS the treatment, so it is expected to differ.
  const reviewedDiff = args.pr
    ? execFileSync('gh', ['pr', 'diff', String(args.pr)], { encoding: 'utf-8', maxBuffer: 64 * 1024 * 1024 })
    : fs.readFileSync(path.resolve(args.diff), 'utf-8')
  const provenance = {
    target: args.pr ? `pr:${args.pr}` : `diff:${path.basename(path.resolve(args.diff))}`,
    diffDigest: sha256(reviewedDiff),
    channels,
    mmrDigest: buildDigest(),
    repoCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf-8' }).trim(),
    configDigest: args.config ? sha256(fs.readFileSync(path.resolve(args.config), 'utf-8')) : null,
  }
  fs.writeFileSync(path.join(outDir, PROVENANCE_FILE), JSON.stringify(provenance, null, 2))

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

  // Installed LAST, immediately before the try that restores it. Anything that
  // can fail — gh pr diff, git, writing provenance — must fail while the repo
  // root is still untouched, or a crash leaves the candidate config live and it
  // silently applies to the user's next review.
  if (args.config) {
    if (fs.existsSync(liveConfig)) restore = fs.readFileSync(liveConfig, 'utf-8')
    fs.copyFileSync(path.resolve(args.config), liveConfig)
    installed = true
  }

  try {
    // Serial, never parallel: concurrent same-account sessions are exactly the
    // condition that makes grok return a cancelled envelope, and a channel that
    // degrades in one arm and not the other silently biases the comparison.
    for (let i = 1; i <= n; i++) {
      const target = path.join(outDir, `run-${String(i).padStart(2, '0')}.json`)
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
        // normal outcomes here — we want the findings, not the verdict — so
        // only a run with no parseable stdout is a real failure.
        raw = err.stdout ?? ''
      }
      const secs = ((Date.now() - started) / 1000).toFixed(0)
      let parsed
      try {
        parsed = JSON.parse(raw)
      } catch {
        process.stderr.write(`FAILED (no JSON) after ${secs}s\n`)
        continue
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
  const digest = sha256(JSON.stringify(findings.map((f) => [f.run, f.severity, f.location, f.description, f.suggestion])))
  return { id, label: conditionLabel(dir), findings, runs, provenance, digest }
}

function loadConditions(spec) {
  const dirs = spec.split(',').map((d) => d.trim()).filter(Boolean)
  if (dirs.length === 0) die('--conditions listed no directories')
  const loaded = dirs.map(loadCondition)
  const seen = new Set()
  for (const c of loaded) {
    if (seen.has(c.id)) die(`condition listed twice: ${c.id}`)
    seen.add(c.id)
  }
  return loaded
}

// ------------------------------------------------------------------ score

function score(args) {
  const conditions = loadConditions(args.conditions ?? die('--conditions required'))
  const judge = args.judge ?? 'claude'
  const rubric = fs.readFileSync(RUBRIC, 'utf-8')

  const pooled = conditions.flatMap((c) => c.findings)
  if (pooled.length === 0) die('no findings found in the given conditions')

  // Shuffle and re-key so the judge cannot infer the arm from ordering.
  const shuffled = shuffle(pooled, 20260731).map((f, i) => ({ ...f, id: `F${String(i + 1).padStart(3, '0')}` }))

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
    `[{"id":"F001","class":"${CLASSES.join('|')}",`,
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
  const match = raw.match(/\[[\s\S]*\]/)
  if (!match) die(`judge returned no JSON array:\n${raw.slice(0, 500)}`)

  let scores
  try {
    scores = JSON.parse(match[0])
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
    conditions: conditions.map((c) => ({
      id: c.id,
      runs: c.runs.map((r) => r.run).sort(),
      findings: c.findings.length,
      // Content, not just counts: re-collecting the same number of runs with
      // the same number of findings must not pass when every finding changed.
      digest: c.digest,
    })),
  }
  const outPath = args.out ?? 'finding-quality-scores.json'
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
export function evaluateVerdict(base, cand, opts = {}) {
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
  const specDown = cand.speculativeRate < base.speculativeRate
  const defectsHeld = cand.defects >= base.defects
  const ship = blockers.length === 0 && specDown && defectsHeld && outsideBand

  return { blockers, bandLo, bandHi, margin, improvement, outsideBand, specDown, defectsHeld, ship }
}

function report(args) {
  const conditions = loadConditions(args.conditions ?? die('--conditions required'))
  const scorePath = args.scores ?? 'finding-quality-scores.json'
  if (!fs.existsSync(scorePath)) die(`scores file not found: ${scorePath} (run \`score\` first)`)
  const raw = JSON.parse(fs.readFileSync(scorePath, 'utf-8'))
  if (!raw || !Array.isArray(raw.scored) || !raw.manifest) {
    die(`${scorePath} is not a manifest-bearing scores file — re-run \`score\``)
  }
  const scored = raw.scored

  // Refuse to report against runs the scores were not produced from.
  for (const c of conditions) {
    const m = raw.manifest.conditions.find((x) => x.id === c.id)
    if (!m) die(`${c.label} is not in the scores manifest — re-run \`score\` for these conditions`)
    if (c.digest !== m.digest) {
      die(`${c.label} has changed since scoring — re-run \`score\``)
    }
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

  if (rows.length !== 2) {
    console.log('note: a ship/revert verdict needs exactly two conditions (baseline, candidate).')
    console.log('')
    // Same exit status as the other no-verdict path, so a caller can treat any
    // non-zero exit as "no decision" without parsing stdout.
    process.exitCode = 1
    return
  }

  const [base, cand] = rows

  // Everything except the config digest must match: the config IS the treatment.
  const extraBlockers = []
  const bp = conditions[0].provenance
  const cp = conditions[1].provenance
  if (!bp || !cp) {
    extraBlockers.push('a condition has no provenance.json — re-run `collect` so the reviewed '
      + 'diff, channel set, and MMR build are recorded')
  } else {
    for (const key of ['target', 'diffDigest', 'channels', 'mmrDigest', 'repoCommit']) {
      if (JSON.stringify(bp[key]) !== JSON.stringify(cp[key])) {
        extraBlockers.push(`${key} differs between conditions (${bp[key]} vs ${cp[key]}) — `
          + 'the arms did not review the same thing')
      }
    }
    // A channel that never appears in per_channel is neither completed nor
    // degraded, so it slips past both of those checks while the arm silently
    // ran with less coverage than it asked for.
    for (const [cond, prov] of [[conditions[0], bp], [conditions[1], cp]]) {
      const requested = prov.channels.split(',').map((c) => c.trim()).sort().join(',')
      for (const r of cond.runs) {
        if (r.dispatched !== requested) {
          extraBlockers.push(`${cond.label}/${r.run} dispatched ${r.dispatched || '(none)'} `
            + `but ${requested} was requested`)
        }
      }
    }
  }

  const sameTreatment = bp !== null && cp !== null && bp.configDigest === cp.configDigest
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

  assert.equal(conditionLabel('/tmp/a/baseline'), 'baseline')
  assert.notEqual(conditionId('/tmp/a/baseline'), conditionId('/tmp/b/baseline'))

  console.log('selftest: all checks passed')
}

const args = parseArgs(process.argv.slice(2))
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
