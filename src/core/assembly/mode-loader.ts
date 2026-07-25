import path from 'node:path'
import fs from 'node:fs'
import { getPackageModesDir } from '../../utils/fs.js'
import type { ScaffoldWarning } from '../../types/index.js'

/**
 * Load the global adoption-mode preamble (content/modes/adoption.md).
 * A missing file is a warning, never fatal — assembly proceeds without the
 * preamble (the step's Adoption Mode Specifics block still applies).
 */
export function loadAdoptionPreamble(projectRoot?: string): {
  content: string | null
  warnings: ScaffoldWarning[]
} {
  const filePath = path.join(getPackageModesDir(projectRoot), 'adoption.md')
  try {
    return { content: fs.readFileSync(filePath, 'utf8').trim(), warnings: [] }
  } catch {
    return {
      content: null,
      warnings: [{
        code: 'ASM_ADOPTION_PREAMBLE_MISSING',
        message: `Adoption-mode preamble not found at ${filePath} — assembling without it`,
      }],
    }
  }
}
