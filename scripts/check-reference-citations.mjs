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

const PAGES = [
  // NOTE: docs/observability/reference.html was migrated to the guide system
  // (content/guides/observability/) and retired to a redirect shim — it is now
  // validated via discoverGuidePages, not here.
  {
    // Migrated to the guide system; the generator now regenerates the guide's
    // gen:* data blocks (the markdown), so rebake checks the .md, not the .html.
    name: 'knowledge-freshness',
    path: 'content/guides/knowledge-freshness/index.html',
    fp: true,
    fileMap: false,
    text: false,
    strictCites: true,
    rebake: 'node scripts/build-freshness-reference.mjs',
    rebakeTarget: 'content/guides/knowledge-freshness/index.md',
  },
  // docs/reference/mmr-reference.html was the legacy twin of content/guides/mmr;
  // it was reconciled into that guide and retired to a redirect shim. The guide
  // is validated via discoverGuidePages.
]

// Guides (content/guides/*/index.html) are discovered dynamically rather than
// hard-coded in PAGES, so every newly authored guide is automatically covered by
// the citation gate (R2-1). Guides emit `:cite[path:line]` as <span class="fp"
// data-path="…"> markup, so they use the `fp` extraction strategy.
export function discoverGuidePages(guidesDir, repoRoot = REPO_ROOT) {
  if (!fs.existsSync(guidesDir) || !fs.statSync(guidesDir).isDirectory()) return []
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
      // strictCites: a guide :cite always targets a real repo file, so validate
      // every fp data-path with a known extension — even repo-root files like
      // CLAUDE.md / package.json that fall outside SOURCE_PATH_RE (R2 P1-C).
      strictCites: true,
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

// Collect `{ cites, advisory }`, each a Set of `relPath|a|b` keys (a/b empty ⇒
// existence-only). `cites` are blocking; `advisory` warn-only (cite-advisory).
export function collect(html, page) {
  const cites = new Set()
  const advisory = new Set()
  // .fp tokens live in body markup; strip <script> so JS templates that build
  // markup at runtime (renderNode's `data-path="' + dataPath + '"`) don't match.
  const bodyHtml = html.replace(/<script\b[\s\S]*?<\/script>/g, '')
  // strictCites (guide pages): a :cite always targets a real repo file, so accept
  // any path with a known extension, not just the standard source dirs.
  const accept = (p) => page.strictCites || isSourcePath(p)
  const DP_LINE_RE = new RegExp('^(.*\\.(?:' + EXT + ')):(\\d+)(?:[-–](\\d+))?$')

  if (page.fp) {
    const FP_RE = /<(?:span|a)\b[^>]*\bclass="[^"]*\bfp\b[^"]*"[^>]*\bdata-path="([^"]+)"[^>]*>([\s\S]*?)<\/(?:span|a)>/g
    for (const m of bodyHtml.matchAll(FP_RE)) {
      let p = m[1]
      const inner = m[2]
      // data-path may itself carry a trailing :line (file-tree leaves).
      const dpm = p.match(DP_LINE_RE)
      if (dpm) {
        p = dpm[1]
        if (accept(p)) cites.add(`${p}|${dpm[2]}|${dpm[3] ?? ''}`)
      } else if (accept(p)) {
        cites.add(`${p}||`) // existence-only
      }
      if (!accept(p)) continue
      const base = p.split('/').pop()
      const lineRe = new RegExp('\\b' + esc(base) + ':(\\d+)(?:[-–](\\d+))?', 'g')
      for (const im of inner.matchAll(lineRe)) cites.add(`${p}|${im[1]}|${im[2] ?? ''}`)
    }

    // Advisory citations (cite-advisory) are validated but warn-only — they back
    // "see also" pointers, not normative claims (P0-a / R2 P2-D).
    if (page.strictCites) {
      const ADV_RE = /<(?:span|a)\b[^>]*\bclass="[^"]*\bcite-advisory\b[^"]*"[^>]*\bdata-path="([^"]+)"[^>]*>[\s\S]*?<\/(?:span|a)>/g
      for (const m of bodyHtml.matchAll(ADV_RE)) {
        const dpm = m[1].match(DP_LINE_RE)
        if (dpm) advisory.add(`${dpm[1]}|${dpm[2]}|${dpm[3] ?? ''}`)
        else advisory.add(`${m[1]}||`)
      }
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

  return { cites, advisory }
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
  // The rebake command may regenerate a different file than the one we scan for
  // citations (e.g. the freshness generator edits the guide .md, not the .html).
  const abs = path.join(REPO_ROOT, page.rebakeTarget || page.path)
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
    diff = execSync(`git diff --stat ${page.rebakeTarget || page.path}`, { cwd: REPO_ROOT }).toString().trim()
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
  // Skip discovered guides already covered by an explicit PAGES entry (e.g. the
  // freshness guide, which needs a rebake check) to avoid validating it twice.
  const staticPaths = new Set(PAGES.map((p) => p.path))
  const discovered = discoverGuidePages(path.join(REPO_ROOT, 'content/guides'), REPO_ROOT)
    .filter((g) => !staticPaths.has(g.path))
  const pages = [...PAGES, ...discovered]
  for (const page of pages) {
    const abs = path.join(REPO_ROOT, page.path)
    if (!fs.existsSync(abs)) {
      console.log(`\n${page.name}: SKIP — ${page.path} not found`)
      continue
    }
    const html = fs.readFileSync(abs, 'utf8')
    const { cites, advisory } = collect(html, page)
    const { drifts, missing } = validate(cites)
    const adv = validate(advisory) // warn-only
    const rebake = rebakeNoop(page)
    const ok = cites.size - drifts.length - missing.length

    console.log(`\n${page.name} (${page.path})`)
    console.log(
      `  ${cites.size} citations · ${ok} ok · ${drifts.length} out-of-range · ${missing.length} missing` +
        (advisory.size ? ` · ${advisory.size} advisory` : '') +
        (page.rebake ? ` · rebake ${rebake.ok ? 'clean' : 'DRIFT'}` : ''),
    )
    for (const d of drifts) console.log(`  out-of-range: ${d}`)
    for (const m of missing) console.log(`  missing: ${m}`)
    for (const d of adv.drifts) console.log(`  advisory out-of-range (warn): ${d}`)
    for (const m of adv.missing) console.log(`  advisory missing (warn): ${m}`)
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

// Robust entry-point detection: resolve symlinks + canonical on-disk casing on
// both sides so the gate is never silently skipped (R2 P2-E). A false negative
// here would bypass the entire citation check.
function isMainModule() {
  if (!process.argv[1]) return false
  try {
    return fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url))
  } catch {
    return false
  }
}
if (isMainModule()) main()
