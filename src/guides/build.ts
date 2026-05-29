import fs from 'node:fs'
import path from 'node:path'
import { atomicWriteFile, getPackageRoot, getPackageGuidesDir } from '../utils/fs.js'
import { buildGuidesIndex, extractGuideFrontmatter } from './loader.js'
import { renderGuideBody } from './render.js'
import { remarkCallout, remarkTabs, remarkFilterTable, remarkChart, remarkSev } from './directives.js'
import { remarkMermaid, pruneDiagrams } from './mermaid.js'
import { wrapInChrome } from './template.js'
import { renderIndexPage } from './index-page.js'
import { lintGuide } from './lint.js'
import type { LintResult } from './lint.js'

export function loadThemeCss(): string {
  const p = path.join(getPackageRoot(), 'dist', 'guides', 'dashboard-theme.css')
  if (!fs.existsSync(p)) {
    throw new Error(`Missing ${p} — run \`npm run build\` (the build copies lib/dashboard-theme.css into dist/guides/).`)
  }
  return fs.readFileSync(p, 'utf8')
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
  const fm = extractGuideFrontmatter(md)
  if (!fm) throw new Error(`invalid or missing frontmatter in ${path.join(args.guideDir, 'index.md')}`)
  const { body, headings } = await renderGuideBody(md, {
    plugins: [
      remarkCallout, remarkTabs, remarkFilterTable, remarkChart, remarkSev,
      remarkMermaid({ guideDir: args.guideDir, render: args.mermaidRender }),
    ],
  })
  // TODO: derive diagram ids from the remark plugin output instead of a regex count (regex can overcount but never undercount, so prune is safe; this keeps coupling explicit).
  const diagramCount = (md.match(/```mermaid/g) ?? []).length
  pruneDiagrams(args.guideDir, Array.from({ length: diagramCount }, (_, i) => `diagram-${i}`))
  const html = wrapInChrome({ title: fm.title, body, headings, css: args.css })
  atomicWriteFile(path.join(args.guideDir, 'index.html'), html)
  return { lint }
}

export async function buildAllGuides(projectRoot?: string): Promise<void> {
  const css = loadThemeCss()
  const guidesDir = getPackageGuidesDir(projectRoot)
  const index = buildGuidesIndex(guidesDir)
  for (const entry of index.values()) {
    await buildGuide({ guideDir: entry.dir, css })
  }
  atomicWriteFile(path.join(guidesDir, 'index.html'), renderIndexPage([...index.values()], css))
}
