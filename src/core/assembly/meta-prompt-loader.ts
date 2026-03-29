import type { MetaPromptFile } from '../../types/index.js'
import { parseAndValidate } from '../../project/frontmatter.js'
import fs from 'node:fs'
import path from 'node:path'

/**
 * Parse level-2 markdown headings into a map of heading text → content.
 * Content is trimmed and spans until the next ## heading or end of body.
 */
function parseSections(body: string): Record<string, string> {
  const sections: Record<string, string> = {}
  const lines = body.split('\n')
  let currentHeading: string | null = null
  let currentContent: string[] = []

  for (const line of lines) {
    const match = line.match(/^## (.+)$/)
    if (match) {
      if (currentHeading !== null) {
        sections[currentHeading] = currentContent.join('\n').trim()
      }
      currentHeading = match[1].trim()
      currentContent = []
    } else if (currentHeading !== null) {
      currentContent.push(line)
    }
  }

  if (currentHeading !== null) {
    sections[currentHeading] = currentContent.join('\n').trim()
  }

  return sections
}

/**
 * Load and parse a single meta-prompt file.
 * Throws on missing file or invalid frontmatter.
 */
export function loadMetaPrompt(filePath: string): MetaPromptFile {
  const { frontmatter, body, errors } = parseAndValidate(filePath)

  if (errors.length > 0) {
    const first = errors[0]
    throw Object.assign(new Error(first.message), { code: first.code, scaffoldError: first })
  }

  const sections = parseSections(body)
  const stepName = path.basename(filePath, '.md')

  if (stepName !== frontmatter.name) {
    // Warn about mismatch but don't throw
    process.stderr.write(
      `[meta-prompt-loader] Warning: filename stem "${stepName}" does not match ` +
        `frontmatter name "${frontmatter.name}" in ${filePath}\n`,
    )
  }

  return {
    stepName,
    filePath,
    frontmatter,
    body,
    sections,
  }
}

/**
 * Scan a directory recursively for all .md files.
 * Adds to the provided result map (frontmatter.name → MetaPromptFile).
 * Files that fail to load are skipped with a warning.
 */
function walkAndLoad(dir: string, result: Map<string, MetaPromptFile>): void {
  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return
  }

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      walkAndLoad(fullPath, result)
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      try {
        const metaPrompt = loadMetaPrompt(fullPath)
        result.set(metaPrompt.frontmatter.name, metaPrompt)
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        process.stderr.write(
          `[meta-prompt-loader] Skipping ${fullPath}: ${message}\n`,
        )
      }
    }
  }
}

/**
 * Scan pipelineDir recursively for all .md files.
 * Returns a map of frontmatter.name → MetaPromptFile.
 * Files that fail to load are skipped with a warning.
 */
export function discoverMetaPrompts(pipelineDir: string): Map<string, MetaPromptFile> {
  const result = new Map<string, MetaPromptFile>()
  walkAndLoad(pipelineDir, result)
  return result
}

/**
 * Scan both pipeline and tools directories for meta-prompts.
 * Returns a unified map of frontmatter.name → MetaPromptFile.
 * Tools directory is optional — if it doesn't exist, only pipeline steps are returned.
 */
export function discoverAllMetaPrompts(pipelineDir: string, toolsDir: string): Map<string, MetaPromptFile> {
  const result = new Map<string, MetaPromptFile>()
  walkAndLoad(pipelineDir, result)
  walkAndLoad(toolsDir, result)
  return result
}
