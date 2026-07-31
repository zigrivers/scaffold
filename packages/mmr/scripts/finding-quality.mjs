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
 *   # 1. collect — N runs of one condition
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
 *   # 3. report — rates per condition, against the ship/revert rule
 *   node scripts/finding-quality.mjs report --conditions runs/baseline,runs/calibrated
 */

import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const MMR = path.resolve(HERE, '../dist/index.js')
const RUBRIC = path.join(HERE, 'finding-quality-rubric.md')

const CLASSES = ['defect', 'speculative', 'deletion', 'hygiene', 'artifact']

function parseArgs(argv) {
  const out = { _: [] }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a.startsWith('--')) out[a.slice(2)] = argv[i + 1]?.startsWith('--') ? true : argv[++i]
    else out._.push(a)
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
  let s = seed
  for (let i = arr.length - 1; i > 0; i--) {
    s = (s * 1103515245 + 12345) & 0x7fffffff
    const j = s % (i + 1)
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

// ---------------------------------------------------------------- collect

function collect(args) {
  const outDir = args.out ?? die('--out required')
  const n = Number(args.n ?? 6)
  const channels = args.channels ?? die('--channels required')
  if (!args.pr && !args.diff) die('--pr or --diff required')
  if (!Number.isInteger(n) || n < 1) die('--n must be a positive integer')

  fs.mkdirSync(outDir, { recursive: true })

  // A candidate config is applied by copying it to the repo root as .mmr.yaml
  // and reviewing with --trust-project-config. Doing it via the working tree
  // (rather than committing it) keeps the experiment off the branch under test.
  const repoRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf-8' }).trim()
  const liveConfig = path.join(repoRoot, '.mmr.yaml')
  let restore = null
  if (args.config) {
    if (fs.existsSync(liveConfig)) restore = fs.readFileSync(liveConfig, 'utf-8')
    fs.copyFileSync(path.resolve(args.config), liveConfig)
  }

  const base = ['review', '--channels', channels, '--sync', '--format', 'json']
  if (args.pr) base.push('--pr', String(args.pr))
  else base.push('--diff', path.resolve(args.diff))
  if (args.config) base.push('--trust-project-config')

  try {
    // Serial, never parallel: concurrent same-account sessions are exactly the
    // condition that makes grok return a cancelled envelope, and a channel that
    // degrades in one arm and not the other silently biases the comparison.
    for (let i = 1; i <= n; i++) {
      process.stderr.write(`[${outDir}] run ${i}/${n} … `)
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
      fs.writeFileSync(path.join(outDir, `run-${String(i).padStart(2, '0')}.json`), raw)
      const degraded = Object.entries(parsed.per_channel ?? {})
        .filter(([, c]) => c.status !== 'completed')
        .map(([k, c]) => `${k}:${c.status}`)
      process.stderr.write(
        `${parsed.reconciled_findings?.length ?? 0} findings, ${secs}s`
        + (degraded.length ? `  DEGRADED ${degraded.join(' ')}` : '') + '\n',
      )
    }
  } finally {
    if (args.config) {
      if (restore !== null) fs.writeFileSync(liveConfig, restore)
      else fs.rmSync(liveConfig, { force: true })
    }
  }
}

/**
 * Load every finding from a condition directory, keeping only channels that
 * completed. A degraded channel contributes no findings, and counting its
 * silence as "found nothing" would read an outage as agreement.
 */
function loadCondition(dir) {
  const findings = []
  const runs = []
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json')).sort()) {
    const r = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf-8'))
    let runTotal = 0
    const degraded = []
    for (const [channel, pc] of Object.entries(r.per_channel ?? {})) {
      if (pc.status !== 'completed') {
        degraded.push(channel)
        continue
      }
      for (const x of pc.findings ?? []) {
        findings.push({
          condition: path.basename(dir),
          run: f,
          channel,
          severity: x.severity,
          location: x.location,
          description: x.description,
          suggestion: x.suggestion,
        })
        runTotal++
      }
    }
    runs.push({ run: f, total: runTotal, degraded })
  }
  return { findings, runs }
}

// ------------------------------------------------------------------ score

function score(args) {
  const dirs = (args.conditions ?? die('--conditions required')).split(',')
  const judge = args.judge ?? 'claude'
  const rubric = fs.readFileSync(RUBRIC, 'utf-8')

  const pooled = []
  for (const d of dirs) pooled.push(...loadCondition(d).findings)
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
    '[{"id":"F001","class":"defect|speculative|deletion|hygiene|artifact",',
    '  "names_path":true|false,"worth_fixing_now":true|false,"why":"one short sentence"}]',
    '',
    'Score every finding. Use exactly one class per finding.',
  ].join('\n')

  process.stderr.write(`scoring ${shuffled.length} findings via ${judge} …\n`)
  const raw = execFileSync(judge, ['-p', prompt], { encoding: 'utf-8', maxBuffer: 64 * 1024 * 1024 })
  const match = raw.match(/\[[\s\S]*\]/)
  if (!match) die(`judge returned no JSON array:\n${raw.slice(0, 500)}`)
  const scores = JSON.parse(match[0])

  const byId = new Map(scores.map((s) => [s.id, s]))
  const scored = shuffled.map((f) => ({ ...f, score: byId.get(f.id) ?? null }))
  const missing = scored.filter((f) => f.score === null)
  if (missing.length) process.stderr.write(`warning: judge skipped ${missing.length} finding(s)\n`)

  const outPath = args.out ?? 'finding-quality-scores.json'
  fs.writeFileSync(outPath, JSON.stringify(scored, null, 2))
  process.stderr.write(`wrote ${outPath}\n`)
}

// ----------------------------------------------------------------- report

function report(args) {
  const dirs = (args.conditions ?? die('--conditions required')).split(',')
  const scored = JSON.parse(fs.readFileSync(args.scores ?? 'finding-quality-scores.json', 'utf-8'))

  const rows = []
  for (const d of dirs) {
    const name = path.basename(d)
    const { runs } = loadCondition(d)
    const mine = scored.filter((f) => f.condition === name && f.score)
    const count = (cls) => mine.filter((f) => f.score.class === cls).length
    const total = mine.length || 1
    const lowValue = mine.filter(
      (f) => f.score.class === 'speculative' || f.score.class === 'artifact' || !f.score.worth_fixing_now,
    ).length
    const totals = runs.map((r) => r.total)
    rows.push({
      condition: name,
      runs: runs.length,
      degraded: runs.filter((r) => r.degraded.length > 0).length,
      findings: mine.length,
      perRun: totals.length ? `${Math.min(...totals)}–${Math.max(...totals)}` : 'n/a',
      speculativeRate: (count('speculative') / total),
      lowValueRate: (lowValue / total),
      defects: count('defect'),
      deletions: count('deletion'),
    })
  }

  const pct = (x) => `${(x * 100).toFixed(0)}%`
  console.log('')
  console.log('condition      runs  deg  findings  per-run  spec-rate  low-value  defects  deletions')
  for (const r of rows) {
    console.log(
      r.condition.padEnd(14)
      + String(r.runs).padStart(4)
      + String(r.degraded).padStart(5)
      + String(r.findings).padStart(10)
      + r.perRun.padStart(9)
      + pct(r.speculativeRate).padStart(11)
      + pct(r.lowValueRate).padStart(11)
      + String(r.defects).padStart(9)
      + String(r.deletions).padStart(11),
    )
  }

  if (rows.length === 2) {
    const [base, cand] = rows
    const specDown = cand.speculativeRate < base.speculativeRate
    const defectsHeld = cand.defects >= base.defects
    console.log('')
    console.log(`speculative rate: ${pct(base.speculativeRate)} → ${pct(cand.speculativeRate)}  ${specDown ? 'down' : 'NOT down'}`)
    console.log(`defect count:     ${base.defects} → ${cand.defects}  ${defectsHeld ? 'held' : 'DROPPED — the bar moved, not the noise'}`)
    console.log('')
    console.log(specDown && defectsHeld
      ? 'VERDICT: ship — speculative rate fell and defect count held.'
      : 'VERDICT: revert — the rubric\'s ship rule is not met.')
    console.log('')
    console.log('Sanity check this against the per-run spread before believing it: a')
    console.log('difference smaller than the baseline\'s own run-to-run range is not a result.')
  }
  console.log('')
}

const args = parseArgs(process.argv.slice(2))
const cmd = args._[0]
if (cmd === 'collect') collect(args)
else if (cmd === 'score') score(args)
else if (cmd === 'report') report(args)
else {
  console.error('usage: finding-quality.mjs <collect|score|report> [options]')
  console.error('see the header of this file for examples')
  process.exit(1)
}
