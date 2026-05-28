#!/usr/bin/env node
// R2-F-012: drift check for docs/knowledge-freshness/reference.html.
// Extracts every `path/to/file.ext:N[-M]` citation from the page and
// asserts the referenced line still exists. Doesn't check semantic
// correctness — just that the line number is in range. Catches the
// off-by-N drift the R2 audit found (audit-prefilter:45 → :43).
//
// Exit codes: 0 on clean, 1 on any drift, 2 on usage error.
// Wire into CI as: `node scripts/check-freshness-reference-citations.mjs`

import fs from 'node:fs'
import path from 'node:path'

const REPO_ROOT = path.resolve(new URL('.', import.meta.url).pathname, '..')
const HTML_PATH = path.join(REPO_ROOT, 'docs/knowledge-freshness/reference.html')

// Match `<path>.<ext>:N` or `<path>.<ext>:N-M` — same shape the R2 audit used.
const CITE_RE = /\b((?:src|tests|scripts|content|docs|\.github)[/\w.-]+\.(?:ts|tsx|js|md|yml|yaml|json|sh|mjs|css|html))(?::(\d+)(?:[-–](\d+))?)?/g

// Bare filenames the page uses (e.g. `audit-apply.ts:54-58` in the script's
// JS comments). Map to the path-prefixed canonical so drift detection still
// fires for these. Add to this map when the page introduces a new bare ref.
const BARE_FILENAME_MAP = {
  'api.ts': 'src/observability/engine/api.ts',
  'audit-apply.ts': 'src/knowledge-freshness/audit-apply.ts',
  'audit-prefilter.ts': 'src/knowledge-freshness/audit-prefilter.ts',
  'audit.yml': '.github/workflows/knowledge-freshness-audit.yml',
  'gates.yml': '.github/workflows/knowledge-freshness-gates.yml',
  'lens-i-lessons-scanner.ts': 'src/observability/checks/lens-i-lessons-scanner.ts',
  'lens-i-knowledge-gaps.ts': 'src/observability/checks/lens-i-knowledge-gaps.ts',
  'knowledge-index.ts': 'src/observability/knowledge-index.ts',
  'bump-version.ts': 'src/knowledge-freshness/bump-version.ts',
  'providers/deepseek.ts': 'src/knowledge-freshness/providers/deepseek.ts',
  'providers/index.ts': 'src/knowledge-freshness/providers/index.ts',
  'observability-config.ts': 'src/observability/engine/checks/observability-config.ts',
  'phase-audit.ts': 'src/observability/engine/phase-audit.ts',
}
const BARE_CITE_RE = new RegExp(
  '\\b(' + Object.keys(BARE_FILENAME_MAP).map((n) => n.replace(/[.+]/g, '\\$&')).join('|') +
  '):(\\d+)(?:[-–](\\d+))?\\b',
  'g',
)

const html = fs.readFileSync(HTML_PATH, 'utf8')
const cites = new Set()
for (const m of html.matchAll(CITE_RE)) {
  const [, relPath, a, b] = m
  if (a == null) continue
  cites.add(`${relPath}|${a}|${b ?? ''}`)
}
for (const m of html.matchAll(BARE_CITE_RE)) {
  const [, bareName, a, b] = m
  const relPath = BARE_FILENAME_MAP[bareName]
  if (!relPath) continue
  cites.add(`${relPath}|${a}|${b ?? ''}`)
}

const drifts = []
const missing = []
for (const key of [...cites].sort()) {
  const [relPath, aStr, bStr] = key.split('|')
  const a = Number(aStr)
  const b = bStr ? Number(bStr) : null
  const abs = path.join(REPO_ROOT, relPath)
  if (!fs.existsSync(abs)) { missing.push(`${relPath}:${a}${b ? '-' + b : ''}`); continue }
  const lines = fs.readFileSync(abs, 'utf8').split('\n').length
  const endLine = b ?? a
  if (a < 1 || endLine > lines) {
    drifts.push(`${relPath}:${a}${b ? '-' + b : ''} (file has ${lines} lines)`)
  }
}

const total = cites.size
const okCount = total - drifts.length - missing.length
console.log(`Checked ${total} file:line citations from docs/knowledge-freshness/reference.html`)
console.log(`  ${okCount} OK`)
console.log(`  ${drifts.length} out-of-range`)
console.log(`  ${missing.length} file-missing`)

if (drifts.length > 0) {
  console.log('\nOut-of-range citations (file shorter than cited line):')
  for (const d of drifts) console.log(`  ${d}`)
}
if (missing.length > 0) {
  console.log('\nMissing files:')
  for (const m of missing) console.log(`  ${m}`)
}

if (drifts.length > 0 || missing.length > 0) {
  console.log('\nNote: this check only verifies the line exists; semantic drift')
  console.log('(line moved but file is still long enough) requires manual review.')
  console.log('To re-bake the page with current line numbers, run:')
  console.log('  node scripts/build-freshness-reference.mjs')
  process.exit(1)
}
process.exit(0)
