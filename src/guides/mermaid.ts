import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { visit } from 'unist-util-visit'
import type { AnyPlugin } from './render.js'

const MMDC_VERSION_FINGERPRINT = 'mmdc11' // bump when render options/version change
const RENDER_OPTS = ['-t', 'neutral', '-b', 'transparent']

export function computeFingerprint(source: string): string {
  return createHash('sha256')
    .update(`${MMDC_VERSION_FINGERPRINT}\n${RENDER_OPTS.join(' ')}\n${source}`)
    .digest('hex')
    .slice(0, 16)
}

// Strict SVG hardening: remove dangerous elements/attrs.
export function sanitizeSvg(svg: string): string {
  return svg
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi, '')
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/((?:xlink:)?href)\s*=\s*("javascript:[^"]*"|'javascript:[^']*')/gi, '')
}

// Default renderer: shells out to mmdc (build-time; needs a browser).
export async function renderMermaid(source: string): Promise<string> {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mmdc-'))
  try {
    const inFile = path.join(tmp, 'in.mmd')
    const outFile = path.join(tmp, 'out.svg')
    fs.writeFileSync(inFile, source)
    execFileSync('npx', ['--no-install', 'mmdc', '-i', inFile, '-o', outFile, ...RENDER_OPTS], {
      stdio: 'pipe',
    })
    return fs.readFileSync(outFile, 'utf8')
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true })
  }
}

export interface ResolveArgs {
  guideDir: string
  diagramId: string
  source: string
  render?: (source: string) => Promise<string>
}

export async function resolveDiagram(args: ResolveArgs): Promise<string> {
  const { guideDir, diagramId, source } = args
  const render = args.render ?? renderMermaid
  const cacheDir = path.join(guideDir, '.diagrams')
  const svgPath = path.join(cacheDir, `${diagramId}.svg`)
  const manifestPath = path.join(cacheDir, 'manifest.json')
  const fp = computeFingerprint(source)
  let manifest: Record<string, string> = {}
  if (fs.existsSync(manifestPath)) {
    try {
      manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
    } catch {
      // Corrupt manifest (e.g. partially-written from a crashed build) — treat as empty.
      manifest = {}
    }
  }
  if (manifest[diagramId] === fp && fs.existsSync(svgPath)) {
    return fs.readFileSync(svgPath, 'utf8')
  }
  let raw: string
  try {
    raw = await render(source)
  } catch (e) {
    throw new Error(
      `mermaid render failed for "${diagramId}" (no browser? install per dev-setup.md). Cache: ${svgPath}\n${String(e)}`,
    )
  }
  const clean = sanitizeSvg(raw)
  fs.mkdirSync(cacheDir, { recursive: true })
  fs.writeFileSync(svgPath, clean)
  manifest[diagramId] = fp
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n')
  return clean
}

// Prune cached SVGs whose diagramId is no longer present.
export function pruneDiagrams(guideDir: string, keepIds: string[]): void {
  const cacheDir = path.join(guideDir, '.diagrams')
  if (!fs.existsSync(cacheDir)) return
  const keep = new Set(keepIds)
  for (const f of fs.readdirSync(cacheDir)) {
    if (f.endsWith('.svg') && !keep.has(f.replace(/\.svg$/, ''))) fs.rmSync(path.join(cacheDir, f))
  }
  const manifestPath = path.join(cacheDir, 'manifest.json')
  if (fs.existsSync(manifestPath)) {
    let m: Record<string, string> = {}
    try {
      m = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
    } catch {
      // Corrupt manifest — self-heal by writing back an empty one after pruning.
    }
    for (const k of Object.keys(m)) if (!keep.has(k)) delete m[k]
    fs.writeFileSync(manifestPath, JSON.stringify(m, null, 2) + '\n')
  }
}

// remark plugin: replace ```mermaid code blocks with the resolved inline SVG.
// Diagram id = `diagram-<n>` by document order.
export function remarkMermaid(opts: {
  guideDir: string
  render?: (s: string) => Promise<string>
}): AnyPlugin {
  return () => async (tree: any) => {
    const jobs: Array<Promise<void>> = []
    let n = 0
    visit(tree, 'code', (node: any) => {
      if (node.lang !== 'mermaid') return
      const diagramId = `diagram-${n++}`
      const source = node.value
      jobs.push(
        resolveDiagram({ guideDir: opts.guideDir, diagramId, source, render: opts.render }).then(
          (svg) => {
            node.type = 'html'
            node.value = `<figure class="mermaid">${svg}</figure>`
          },
        ),
      )
    })
    await Promise.all(jobs)
  }
}
