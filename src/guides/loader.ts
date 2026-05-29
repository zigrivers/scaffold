import fs from 'node:fs'
import path from 'node:path'
import yaml from 'js-yaml'
import type { GuideFrontmatter, GuideEntry } from './types.js'

export function extractGuideFrontmatter(content: string): GuideFrontmatter | null {
  const lines = content.split(/\r?\n/)
  if (lines[0]?.trim() !== '---') return null
  const closeIdx = lines.indexOf('---', 1)
  if (closeIdx === -1) return null
  const yamlText = lines.slice(1, closeIdx).join('\n')
  let parsed: unknown
  try {
    parsed = yaml.load(yamlText, { schema: yaml.JSON_SCHEMA })
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== 'object') return null
  const p = parsed as Record<string, unknown>
  if (
    typeof p.title !== 'string' || typeof p.topic !== 'string' ||
    typeof p.description !== 'string' || typeof p.category !== 'string' ||
    typeof p.order !== 'number'
  ) return null
  const fm: GuideFrontmatter = {
    title: p.title, topic: p.topic, description: p.description,
    category: p.category, order: p.order,
  }
  if (Array.isArray(p.escape_scripts)) {
    fm.escape_scripts = p.escape_scripts.filter((s): s is string => typeof s === 'string')
  }
  return fm
}

export function buildGuidesIndex(guidesDir: string): Map<string, GuideEntry> {
  const index = new Map<string, GuideEntry>()
  if (!fs.existsSync(guidesDir)) return index
  let dirents: fs.Dirent[]
  try {
    dirents = fs.readdirSync(guidesDir, { withFileTypes: true })
  } catch {
    return index
  }
  for (const d of dirents) {
    if (!d.isDirectory() || d.name.startsWith('.')) continue
    const dir = path.join(guidesDir, d.name)
    const mdPath = path.join(dir, 'index.md')
    if (!fs.existsSync(mdPath)) continue
    let fm: GuideFrontmatter | null
    try {
      fm = extractGuideFrontmatter(fs.readFileSync(mdPath, 'utf8'))
    } catch {
      continue
    }
    if (!fm || fm.topic !== d.name) continue
    index.set(fm.topic, { topic: fm.topic, dir, mdPath, htmlPath: path.join(dir, 'index.html'), frontmatter: fm })
  }
  return index
}
