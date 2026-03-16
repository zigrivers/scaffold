// src/validation/frontmatter-validator.ts

import fs from 'node:fs'
import path from 'node:path'
import type { ScaffoldError, ScaffoldWarning } from '../types/index.js'
import { parseAndValidate } from '../project/frontmatter.js'

/**
 * Scan all .md files in pipelineDir (recursively), validate frontmatter in each,
 * and accumulate errors from all files (ADR-040 accumulate-and-report pattern).
 */
export function validateFrontmatter(pipelineDir: string): {
  errors: ScaffoldError[]
  warnings: ScaffoldWarning[]
  validFiles: number
  totalFiles: number
} {
  const errors: ScaffoldError[] = []
  const warnings: ScaffoldWarning[] = []
  let validFiles = 0
  let totalFiles = 0

  // Collect all .md files recursively
  const mdFiles = collectMdFiles(pipelineDir)
  totalFiles = mdFiles.length

  for (const filePath of mdFiles) {
    const result = parseAndValidate(filePath)
    if (result.errors.length > 0) {
      errors.push(...result.errors)
    } else {
      validFiles++
    }
    warnings.push(...result.warnings)
  }

  return { errors, warnings, validFiles, totalFiles }
}

/** Recursively collect all .md file paths under dir. */
function collectMdFiles(dir: string): string[] {
  const result: string[] = []

  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return result
  }

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      result.push(...collectMdFiles(fullPath))
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      result.push(fullPath)
    }
  }

  return result
}
