#!/usr/bin/env node
// Generic citation-drift check for the single-file interactive reference
// pages under docs/. For each registered page it extracts `path:line`
// citations and asserts the referenced line still exists; for generated
// pages it also re-runs the build script and asserts the output is a no-op
// (the "rebake must be idempotent" gate).
//
// This supersedes the page-specific scripts/check-freshness-reference-citations.mjs
// (re-folded here). Add a page by appending to PAGES below.
//
// Extraction strategies (composable per page):
//   - fp:      pair each `<span|a class="…fp…" data-path="PATH">…<code>name:line</code>…`
//              -> validate PATH exists + the inline line range. data-path-only
//              tokens get an existence check. .fp tokens only ever wrap REAL
//              files, so fictional example paths in prose are never matched.
//   - fileMap: pull `path: '…'` literals out of a baked FILE_MAP/OBS_FILE_MAP
//              JS object -> existence check (the clickable source tree).
//   - text:    the original freshness regex — full `prefix/…/file.ext:line`
//              tokens. Only citations WITH a line are validated (path-only
//              prose mentions are skipped, matching the original checker), and
//              `ignore` paths (fictional examples) are dropped.
//   - bareMap: bare `file.ext:line` -> canonical path via a hand map.
//
// Exit codes: 0 clean, 1 drift, 2 usage error.

import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = path.resolve(new URL('.', import.meta.url).pathname, '..')

const EXT = 'ts|tsx|js|mjs|md|yml|yaml|json|sh|css|html'
const DEFAULT_PREFIX = 'src|tests|scripts|content|docs|\\.github'

// Re-folded verbatim from check-freshness-reference-citations.mjs: bare
// filenames the freshness page uses in JS comments without a path prefix.
const FRESHNESS_BARE_MAP = {
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

const PAGES = [
  {
    name: 'observability',
    path: 'docs/observability/reference.html',
    fp: true,
    fileMap: true,
    text: false,
    rebake: null,
  },
  {
    name: 'knowledge-freshness',
    path: 'docs/knowledge-freshness/reference.html',
    fp: false,
    fileMap: false,
    text: true,
    bareMap: FRESHNESS_BARE_MAP,
    rebake: 'node scripts/build-freshness-reference.mjs',
  },
  {
    name: 'mmr-reference',
    path: 'docs/reference/mmr-reference.html',
    fp: false,
    fileMap: false,
    text: true,
    // packages/ is in the prefix so future packages/mmr/* citations are caught.
    prefix: 'src|tests|scripts|content|docs|\\.github|lib|packages',
    ignore: ['src/auth.ts'], // fictional example finding (src/auth.ts:42)
    rebake: null,
  },
]

// Guides (content/guides/*/index.html) are discovered dynamically rather than
// hard-coded in PAGES, so every newly authored guide is automatically covered by
// the citation gate (R2-1). Guides emit `:cite[path:line]` as <span class="fp"
// data-path="…"> markup, so they use the `fp` extraction strategy.
export function discoverGuidePages(guidesDir, repoRoot = REPO_ROOT) {
  if (!fs.existsSync(guidesDir)) return []
  const out = []
  for (const entry of fs.readdirSync(guidesDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const indexHtml = path.join(guidesDir, entry.name, 'index.html')
    if (!fs.existsSync(indexHtml)) continue
    out.push({
      name: `guide:${entry.name}`,
      path: path.relative(repoRoot, indexHtml),
      fp: true,
      fileMap: false,
      text: false,
      rebake: null,
    })
  }
  return out.sort((a, b) => a.name.localeCompare(b.name))
}

const esc = (s) => s.replace(/[.+*?^${}()|[\]\\]/g, '\\$&')

// Only repo-tracked source trees are existence-checked. Runtime paths the
// pages legitimately reference (e.g. .scaffold/activity.jsonl) and JS-string
// fragments are skipped rather than flagged missing.
const SOURCE_PATH_RE = /^(?:src|tests|scripts|content|docs|lib|packages|\.github)\//
const isSourcePath = (p) => SOURCE_PATH_RE.test(p)

// Collect a Set of `relPath|a|b` keys. a/b empty ⇒ existence-only check.
function collect(html, page) {
  const cites = new Set()
  // .fp tokens live in body markup; strip <script> so JS templates that build
  // markup at runtime (renderNode's `data-path="' + dataPath + '"`) don't match.
  const bodyHtml = html.replace(/<script\b[\s\S]*?<\/script>/g, '')

  if (page.fp) {
    const FP_RE = /<(?:span|a)\b[^>]*\bclass="[^"]*\bfp\b[^"]*"[^>]*\bdata-path="([^"]+)"[^>]*>([\s\S]*?)<\/(?:span|a)>/g
    for (const m of bodyHtml.matchAll(FP_RE)) {
      let p = m[1]
      const inner = m[2]
      // data-path may itself carry a trailing :line (file-tree leaves).
      const dpm = p.match(new RegExp('^(.*\\.(?:' + EXT + ')):(\\d+)(?:[-–](\\d+))?$'))
      if (dpm) {
        p = dpm[1]
        if (isSourcePath(p)) cites.add(`${p}|${dpm[2]}|${dpm[3] ?? ''}`)
      } else if (isSourcePath(p)) {
        cites.add(`${p}||`) // existence-only
      }
      if (!isSourcePath(p)) continue
      const base = p.split('/').pop()
      const lineRe = new RegExp('\\b' + esc(base) + ':(\\d+)(?:[-–](\\d+))?', 'g')
      for (const im of inner.matchAll(lineRe)) cites.add(`${p}|${im[1]}|${im[2] ?? ''}`)
    }
  }

  if (page.fileMap) {
    const FM_RE = new RegExp(
      "path:\\s*'((?:" + (page.prefix || DEFAULT_PREFIX) + ")[^']+?\\.(?:" + EXT + "))'",
      'g',
    )
    for (const m of html.matchAll(FM_RE)) cites.add(`${m[1]}||`) // existence-only
  }

  if (page.text) {
    const TEXT_RE = new RegExp(
      '\\b((?:' + (page.prefix || DEFAULT_PREFIX) + ')[/\\w.-]+\\.(?:' + EXT + '))(?::(\\d+)(?:[-–](\\d+))?)?',
      'g',
    )
    const ignore = new Set(page.ignore || [])
    for (const m of html.matchAll(TEXT_RE)) {
      const [, rel, a, b] = m
      if (a == null) continue // line-required (path-only prose mentions skipped)
      if (ignore.has(rel)) continue
      cites.add(`${rel}|${a}|${b ?? ''}`)
    }
    if (page.bareMap) {
      const bareRe = new RegExp(
        '\\b(' + Object.keys(page.bareMap).map(esc).join('|') + '):(\\d+)(?:[-–](\\d+))?\\b',
        'g',
      )
      for (const m of html.matchAll(bareRe)) {
        const rel = page.bareMap[m[1]]
        if (!rel) continue
        cites.add(`${rel}|${m[2]}|${m[3] ?? ''}`)
      }
    }
  }

  return cites
}

function validate(cites) {
  const drifts = []
  const missing = []
  for (const key of [...cites].sort()) {
    const [rel, aStr, bStr] = key.split('|')
    const abs = path.join(REPO_ROOT, rel)
    if (!fs.existsSync(abs)) {
      missing.push(rel + (aStr ? `:${aStr}` : ''))
      continue
    }
    if (!aStr) continue // existence-only
    const a = Number(aStr)
    const b = bStr ? Number(bStr) : null
    const lines = fs.readFileSync(abs, 'utf8').split('\n').length
    const end = b ?? a
    if (a < 1 || end > lines) drifts.push(`${rel}:${a}${b ? '-' + b : ''} (file has ${lines} lines)`)
  }
  return { drifts, missing }
}

// Generated pages: re-run the build and assert the committed page is a no-op.
function rebakeNoop(page) {
  if (!page.rebake) return { ok: true, notes: [] }
  const abs = path.join(REPO_ROOT, page.path)
  const before = fs.readFileSync(abs)
  const hashBefore = createHash('sha256').update(before).digest('hex')
  try {
    execSync(page.rebake, { cwd: REPO_ROOT, stdio: 'ignore' })
  } catch (e) {
    return { ok: true, notes: [`(skipping rebake check: ${e.message})`] }
  }
  const after = fs.readFileSync(abs)
  const hashAfter = createHash('sha256').update(after).digest('hex')
  if (hashBefore === hashAfter) return { ok: true, notes: [] }
  let diff = ''
  try {
    diff = execSync(`git diff --stat ${page.path}`, { cwd: REPO_ROOT }).toString().trim()
  } catch { /* ignore */ }
  fs.writeFileSync(abs, before) // restore — don't leave the tree dirty
  return {
    ok: false,
    notes: [
      `Re-running \`${page.rebake}\` changed the page — the committed file is out of sync with its build. Re-bake and commit.`,
      diff ? `Diff after rebake: ${diff}` : '',
    ].filter(Boolean),
  }
}

function main() {
  let failed = false
  const pages = [...PAGES, ...discoverGuidePages(path.join(REPO_ROOT, 'content/guides'), REPO_ROOT)]
  for (const page of pages) {
    const abs = path.join(REPO_ROOT, page.path)
    if (!fs.existsSync(abs)) {
      console.log(`\n${page.name}: SKIP — ${page.path} not found`)
      continue
    }
    const html = fs.readFileSync(abs, 'utf8')
    const cites = collect(html, page)
    const { drifts, missing } = validate(cites)
    const rebake = rebakeNoop(page)
    const ok = cites.size - drifts.length - missing.length

    console.log(`\n${page.name} (${page.path})`)
    console.log(
      `  ${cites.size} citations · ${ok} ok · ${drifts.length} out-of-range · ${missing.length} missing` +
        (page.rebake ? ` · rebake ${rebake.ok ? 'clean' : 'DRIFT'}` : ''),
    )
    for (const d of drifts) console.log(`  out-of-range: ${d}`)
    for (const m of missing) console.log(`  missing: ${m}`)
    for (const n of rebake.notes) console.log(`  ${n}`)

    if (drifts.length || missing.length || !rebake.ok) failed = true
  }

  if (failed) {
    console.log('\nLine-citation checks only verify the line exists, not that it still')
    console.log('points at the right symbol — semantic drift needs manual review.')
    process.exit(1)
  }
  console.log('\nAll reference-page citations resolve.')
  process.exit(0)
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) main()
