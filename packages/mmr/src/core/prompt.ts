import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const TEMPLATE_PATH = resolve(__dirname, '../../templates/core-prompt.md')

let cachedTemplate: string | undefined

function loadTemplate(): string {
  if (cachedTemplate === undefined) {
    cachedTemplate = readFileSync(TEMPLATE_PATH, 'utf-8')
  }
  return cachedTemplate
}

export interface AssemblePromptOptions {
  /** The unified diff to review */
  diff: string
  /** Project-specific review criteria lines */
  reviewCriteria?: string[]
  /** Template-level criteria (e.g. from methodology presets) */
  templateCriteria?: string[]
  /** Free-text focus areas for this review */
  focus?: string
  /** Channel prompt wrapper with {{prompt}} placeholder */
  promptWrapper?: string
}

/**
 * Assemble the full review prompt from layered components.
 *
 * Layers (in order):
 *   1. Core prompt template (severity defs, output format)
 *   2. Project review criteria (if provided)
 *   2b. Template criteria (if provided)
 *   3. Focus areas (if provided)
 *   4. The diff (always last)
 *
 * After assembly, applies the optional prompt wrapper.
 */
export function assemblePrompt(options: AssemblePromptOptions): string {
  const { diff, reviewCriteria, templateCriteria, focus, promptWrapper } = options

  const layers: string[] = []

  // Layer 1: Core prompt (always)
  layers.push(loadTemplate())

  // Layer 2: Project review criteria
  if (reviewCriteria && reviewCriteria.length > 0) {
    layers.push(
      '## Project Review Criteria\n' +
        reviewCriteria.map((c) => `- ${c}`).join('\n'),
    )
  }

  // Layer 2b: Template criteria
  if (templateCriteria && templateCriteria.length > 0) {
    layers.push(
      '## Template Criteria\n' +
        templateCriteria.map((c) => `- ${c}`).join('\n'),
    )
  }

  // Layer 3: Focus areas
  if (focus) {
    layers.push(`## Focus Areas\n${focus}`)
  }

  // Layer 4: The diff (always last)
  layers.push(`## Diff\n\`\`\`diff\n${diff}\n\`\`\``)

  let assembled = layers.join('\n\n')

  // Apply prompt wrapper if provided
  if (promptWrapper) {
    assembled = promptWrapper.replace('{{prompt}}', assembled)
  }

  return assembled
}
