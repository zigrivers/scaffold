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
import { findBrokenRelativeLinks } from './links.js'

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

export async function buildGuide(args: BuildGuideArgs): Promise<{ lint: LintResult }> {
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
  pruneDiagrams(args.guideDir, diagramIds)
  const html = wrapInChrome({ title: fm.title, body, headings, css: args.css })
  atomicWriteFile(path.join(args.guideDir, 'index.html'), html)
  return { lint }
}

export async function buildAllGuides(projectRoot?: string): Promise<void> {
  const css = loadGuideStyles()
  const guidesDir = getPackageGuidesDir(projectRoot)
  const index = buildGuidesIndex(guidesDir)
  for (const entry of index.values()) {
    await buildGuide({ guideDir: entry.dir, css })
  }
  atomicWriteFile(path.join(guidesDir, 'index.html'), renderIndexPage([...index.values()], css))
}
