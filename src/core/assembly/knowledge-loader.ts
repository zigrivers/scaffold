import type { KnowledgeEntry } from '../../types/index.js'
import type { ScaffoldWarning } from '../../types/index.js'
import { fileExists } from '../../utils/fs.js'
import yaml from 'js-yaml'
import fs from 'node:fs'
import path from 'node:path'

interface KBFrontmatter {
  name: string
  description: string
  topics: string[]
}

/**
 * Extract and parse YAML frontmatter from knowledge base file content.
 * Returns null if frontmatter is missing or has no name field.
 */
export function extractKBFrontmatter(content: string): KBFrontmatter | null {
  const lines = content.split('\n')

  if (lines[0]?.trim() !== '---') {
    return null
  }

  let closeIdx = -1
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') {
      closeIdx = i
      break
    }
  }

  if (closeIdx === -1) {
    return null
  }

  const yamlText = lines.slice(1, closeIdx).join('\n')

  let parsed: unknown
  try {
    parsed = yaml.load(yamlText)
  } catch {
    return null
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return null
  }

  const obj = parsed as Record<string, unknown>

  if (typeof obj['name'] !== 'string' || obj['name'].trim() === '') {
    return null
  }

  return {
    name: obj['name'].trim(),
    description: typeof obj['description'] === 'string' ? obj['description'].trim() : '',
    topics: Array.isArray(obj['topics'])
      ? (obj['topics'] as unknown[]).filter((t): t is string => typeof t === 'string')
      : [],
  }
}

/**
 * Extract the body content after the closing frontmatter delimiter.
 */
function extractBody(content: string): string {
  const lines = content.split('\n')

  if (lines[0]?.trim() !== '---') {
    return content
  }

  let closeIdx = -1
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') {
      closeIdx = i
      break
    }
  }

  if (closeIdx === -1) {
    return ''
  }

  return lines.slice(closeIdx + 1).join('\n').trim()
}

/**
 * Scan knowledgeDir recursively for .md files.
 * Returns a map of entry name → absolute file path.
 * Gracefully returns an empty map if the directory does not exist.
 */
export function buildIndex(knowledgeDir: string): Map<string, string> {
  const index = new Map<string, string>()

  if (!fileExists(knowledgeDir)) return index

  function walkDir(dir: string): void {
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        walkDir(fullPath)
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        try {
          const content = fs.readFileSync(fullPath, 'utf8')
          const fm = extractKBFrontmatter(content)
          if (fm?.name) {
            index.set(fm.name, fullPath)
          }
        } catch {
          // skip invalid files
        }
      }
    }
  }

  walkDir(knowledgeDir)
  return index
}

/**
 * Like buildIndex(), but checks <projectRoot>/.scaffold/knowledge/ first.
 * Local overrides take precedence over global entries by the same name.
 * Emits a stderr warning for duplicate names within the local override dir.
 */
export function buildIndexWithOverrides(
  projectRoot: string,
  globalKnowledgeDir: string,
): Map<string, string> {
  // Build global index first (lower precedence)
  const globalIndex = buildIndex(globalKnowledgeDir)

  // Build local override index
  const localDir = path.join(projectRoot, '.scaffold', 'knowledge')
  const localIndex = new Map<string, string>()

  function walkLocal(dir: string): void {
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        walkLocal(fullPath)
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        try {
          const content = fs.readFileSync(fullPath, 'utf8')
          const fm = extractKBFrontmatter(content)
          if (fm?.name) {
            if (localIndex.has(fm.name)) {
              process.stderr.write(
                `warn: duplicate knowledge override name "${fm.name}" in ${localDir} — using last found\n`,
              )
            }
            localIndex.set(fm.name, fullPath)
          }
        } catch {
          // skip invalid files
        }
      }
    }
  }

  if (fileExists(localDir)) {
    walkLocal(localDir)
  }

  // Merge: local overrides win
  const merged = new Map(globalIndex)
  for (const [name, filePath] of localIndex) {
    merged.set(name, filePath)
  }
  return merged
}

/**
 * Load the named knowledge base entries from the index.
 * Missing entries produce FRONTMATTER_KB_ENTRY_MISSING warnings (non-fatal).
 */
export function loadEntries(
  index: Map<string, string>,
  names: string[],
): { entries: KnowledgeEntry[]; warnings: ScaffoldWarning[] } {
  const entries: KnowledgeEntry[] = []
  const warnings: ScaffoldWarning[] = []

  for (const name of names) {
    const filePath = index.get(name)
    if (!filePath) {
      warnings.push({
        code: 'FRONTMATTER_KB_ENTRY_MISSING',
        message: `Knowledge base entry "${name}" not found in index`,
        context: { name },
      })
      continue
    }

    try {
      const content = fs.readFileSync(filePath, 'utf8')
      const fm = extractKBFrontmatter(content)

      if (!fm) {
        warnings.push({
          code: 'FRONTMATTER_KB_ENTRY_MISSING',
          message: `Knowledge base entry "${name}" has invalid frontmatter`,
          context: { name, file: filePath },
        })
        continue
      }

      const body = extractBody(content)

      entries.push({
        name: fm.name,
        description: fm.description,
        topics: fm.topics,
        content: body,
      })
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err)
      warnings.push({
        code: 'FRONTMATTER_KB_ENTRY_MISSING',
        message: `Failed to load knowledge base entry "${name}": ${detail}`,
        context: { name, file: filePath },
      })
    }
  }

  return { entries, warnings }
}
