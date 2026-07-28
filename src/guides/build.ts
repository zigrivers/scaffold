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
}

export interface BuildGuideResult {
  lint: LintResult
  /** Heading ids the renderer emitted, for cross-guide anchor checking. */
  ids: Set<string>
  /** The source that produced them, so the caller need not re-read it. */
  markdown: string
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
  const { body, headings } = await renderGuideBody(md, {
    plugins: [
      remarkCallout, remarkTabs, remarkFilterTable, remarkChart, remarkSev, remarkCite,
      remarkMermaid({ guideDir: args.guideDir, render: args.mermaidRender, collect: diagramIds }),
    ],
  })
  // Anchors are checked HERE, not before rendering, so they can be judged
  // against the ids the renderer actually emitted rather than a second
  // derivation of them. Throwing before the write keeps the check fail-closed:
  // a guide with a dead fragment leaves its index.html untouched.
  const dupes = headings.map((h) => h.id).filter((id, i, all) => all.indexOf(id) !== i)
  if (dupes.length) {
    const list = [...new Set(dupes)].join('\n  ')
    throw new Error(
      `guide has duplicate heading id(s), so an anchor to the later one is unreachable:\n  ${list}`,
    )
  }
  const ids = new Set(headings.map((h) => h.id))
  const brokenAnchors = findBrokenAnchors(md, { selfIds: ids })
  if (brokenAnchors.length) {
    throw new Error(`guide has broken anchor link(s):\n  ${brokenAnchors.join('\n  ')}`)
  }

  pruneDiagrams(args.guideDir, diagramIds)
  const html = wrapInChrome({ title: fm.title, body, headings, css: args.css })
  atomicWriteFile(path.join(args.guideDir, 'index.html'), html)
  return { lint, ids, markdown: md }
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
  for (const entry of index.values()) {
    const { ids, markdown } = await buildGuide({ guideDir: entry.dir, css })
    idsByTopic.set(entry.frontmatter.topic, ids)
    sources.set(entry.frontmatter.topic, markdown)
  }

  const broken: string[] = []
  for (const [topic, markdown] of sources) {
    const selfIds = idsByTopic.get(topic) ?? new Set<string>()
    for (const a of findBrokenAnchors(markdown, { selfIds, idsByTopic })) {
      broken.push(`${topic}: ${a}`)
    }
  }
  if (broken.length) {
    throw new Error(`broken cross-guide anchor link(s):\n  ${broken.join('\n  ')}`)
  }

  atomicWriteFile(path.join(guidesDir, 'index.html'), renderIndexPage([...index.values()], css))
}
