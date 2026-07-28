import fs from 'node:fs'
import path from 'node:path'
import { atomicWriteFile, getPackageRoot, getPackageGuidesDir } from '../utils/fs.js'
import { buildGuidesIndex, extractGuideFrontmatter } from './loader.js'
import { renderGuideBody } from './render.js'
import { remarkCallout, remarkTabs, remarkFilterTable, remarkChart, remarkSev, remarkCite } from './directives.js'
import { remarkMermaid, pruneDiagrams } from './mermaid.js'
import { wrapInChrome } from './template.js'
import { renderIndexPage } from './index-page.js'
import { lintGuide } from './lint.js'
import type { LintResult } from './lint.js'
import { findBrokenRelativeLinks, findBrokenAnchors } from './links.js'

export function loadGuideStyles(): string {
  // The guide stylesheet is the design tokens (dashboard-theme.css) followed by
  // the guide-specific layout + component styles (guides.css). Both are inlined
  // into each guide's <style> so the output stays self-contained.
  const dir = path.join(getPackageRoot(), 'dist', 'guides')
  const parts = ['dashboard-theme.css', 'guides.css'].map((name) => {
    const p = path.join(dir, name)
    if (!fs.existsSync(p)) {
      throw new Error(
        `Missing ${p} — run \`npm run build\` (the build copies lib/${name} into dist/guides/).`,
      )
    }
    return fs.readFileSync(p, 'utf8')
  })
  return parts.join('\n')
}

export interface BuildGuideArgs {
  guideDir: string
  css: string
  mermaidRender?: (source: string) => Promise<string>
  /**
   * Return the rendered HTML instead of writing it. `buildAllGuides` uses this
   * so a broken CROSS-guide anchor — which cannot be detected until every guide
   * has been rendered — still leaves the whole tree at its previous content,
   * matching the per-guide checks rather than half-updating the output.
   */
  deferWrite?: boolean
}

export interface BuildGuideResult {
  lint: LintResult
  /** Heading ids the renderer emitted, for cross-guide anchor checking. */
  ids: Set<string>
  /** The source that produced them, so the caller need not re-read it. */
  markdown: string
  /** Rendered page and its destination; present only with `deferWrite`. */
  pending?: { outPath: string; html: string }
}

export async function buildGuide(args: BuildGuideArgs): Promise<BuildGuideResult> {
  const md = fs.readFileSync(path.join(args.guideDir, 'index.md'), 'utf8')
  const lint = lintGuide(md)
  if (lint.errors.length) {
    throw new Error(`guide lint failed:\n  ${lint.errors.join('\n  ')}`)
  }
  for (const w of lint.warnings) process.stderr.write(`warning: ${w}\n`)
  const brokenLinks = findBrokenRelativeLinks(md, args.guideDir)
  if (brokenLinks.length) {
    throw new Error(`guide has broken relative link(s):\n  ${brokenLinks.join('\n  ')}`)
  }
  const fm = extractGuideFrontmatter(md)
  if (!fm) throw new Error(`invalid or missing frontmatter in ${path.join(args.guideDir, 'index.md')}`)
  const diagramIds: string[] = []
  const { body, headings, anchors } = await renderGuideBody(md, {
    plugins: [
      remarkCallout, remarkTabs, remarkFilterTable, remarkChart, remarkSev, remarkCite,
      remarkMermaid({ guideDir: args.guideDir, render: args.mermaidRender, collect: diagramIds }),
    ],
  })
  // Prune before the anchor checks: diagram pruning is independent of them, and
  // leaving it after a throw would strand orphaned .diagrams/ artifacts (which
  // are tracked in git) in the working tree on every failed build.
  pruneDiagrams(args.guideDir, diagramIds)

  // Anchors are checked HERE, not before rendering, so they can be judged
  // against the ids the renderer actually emitted rather than a second
  // derivation of them. Throwing before atomicWriteFile keeps index.html at its
  // previous content when a guide has a dead fragment.
  const blank = anchors.filter((h) => !h.id).map((h) => h.text)
  if (blank.length) {
    throw new Error(
      `guide has heading(s) that produce no id, so nothing can link to them:\n  ${blank.join('\n  ')}`,
    )
  }
  const seen = new Map<string, string[]>()
  for (const h of anchors) seen.set(h.id, [...(seen.get(h.id) ?? []), h.text])
  const dupes = [...seen].filter(([, texts]) => texts.length > 1)
  if (dupes.length) {
    const list = dupes.map(([id, texts]) => `${id}  <- ${texts.join(' / ')}`).join('\n  ')
    throw new Error(
      `guide has duplicate heading id(s), so an anchor to the later one is unreachable:\n  ${list}`,
    )
  }
  const ids = new Set(anchors.map((h) => h.id))
  const brokenAnchors = findBrokenAnchors(md, { selfIds: ids, topic: path.basename(args.guideDir) })
  if (brokenAnchors.length) {
    throw new Error(`guide has broken anchor link(s):\n  ${brokenAnchors.join('\n  ')}`)
  }
  const html = wrapInChrome({ title: fm.title, body, headings, css: args.css })
  const outPath = path.join(args.guideDir, 'index.html')
  if (args.deferWrite) return { lint, ids, markdown: md, pending: { outPath, html } }
  atomicWriteFile(outPath, html)
  return { lint, ids, markdown: md }
}

/**
 * Cross-guide anchors that resolve to no heading in their target guide.
 *
 * Split out of `buildAllGuides` so it is testable without a guides tree on
 * disk. Same-page anchors have already thrown inside `buildGuide` by the time
 * this runs, so in the real pipeline it only ever reports cross-guide targets;
 * `selfIds` is still supplied so it cannot double-report them.
 *
 * `sources` is keyed by `frontmatter.topic`, which `buildGuidesIndex`
 * guarantees equals the directory name — the same name `../<dir>/` links use.
 */
export function crossGuideAnchorErrors(
  sources: ReadonlyMap<string, string>,
  idsByTopic: ReadonlyMap<string, ReadonlySet<string>>,
): string[] {
  const broken: string[] = []
  for (const [topic, markdown] of sources) {
    const selfIds = idsByTopic.get(topic) ?? new Set<string>()
    for (const a of findBrokenAnchors(markdown, { selfIds, topic, idsByTopic })) {
      broken.push(`${topic}: ${a}`)
    }
  }
  return broken
}

export async function buildAllGuides(projectRoot?: string): Promise<void> {
  const css = loadGuideStyles()
  const guidesDir = getPackageGuidesDir(projectRoot)
  const index = buildGuidesIndex(guidesDir)

  // Build every guide first, collecting the ids each one really emitted. A
  // cross-guide anchor can only be judged once its target has been rendered,
  // which is why this pass cannot live inside buildGuide.
  const idsByTopic = new Map<string, Set<string>>()
  const sources = new Map<string, string>()
  const pending: { outPath: string; html: string }[] = []
  for (const entry of index.values()) {
    const res = await buildGuide({ guideDir: entry.dir, css, deferWrite: true })
    idsByTopic.set(entry.frontmatter.topic, res.ids)
    sources.set(entry.frontmatter.topic, res.markdown)
    if (res.pending) pending.push(res.pending)
  }

  const broken = crossGuideAnchorErrors(sources, idsByTopic)
  if (broken.length) {
    throw new Error(`broken cross-guide anchor link(s):\n  ${broken.join('\n  ')}`)
  }

  // Nothing is written until every guide has rendered AND the cross-guide pass
  // is clean, so a dead cross-guide fragment leaves the output tree untouched
  // rather than rewriting each page and stranding a stale root index.
  for (const p of pending) atomicWriteFile(p.outPath, p.html)
  atomicWriteFile(path.join(guidesDir, 'index.html'), renderIndexPage([...index.values()], css))
}
