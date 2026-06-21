import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const TEMPLATE_PATH = resolve(__dirname, '../../templates/critique-prompt.md')

let cachedTemplate: string | undefined

function loadTemplate(): string {
  if (cachedTemplate === undefined) {
    cachedTemplate = readFileSync(TEMPLATE_PATH, 'utf-8')
  }
  return cachedTemplate
}

export interface AssembleCritiquePromptOptions {
  /** The artifact to critique (design doc, plan, or problem + proposed solution). */
  artifact: string
  /** Free-text focus areas for this critique. */
  focus?: string
  /** Channel prompt wrapper with {{prompt}} placeholder. */
  promptWrapper?: string
}

/**
 * Assemble the critique prompt: design-critique template → optional focus →
 * the artifact (always last), then the optional channel wrapper. Mirrors the
 * layering of `assemblePrompt` but with the design framing and no diff/severity.
 */
export function assembleCritiquePrompt(options: AssembleCritiquePromptOptions): string {
  const { artifact, focus, promptWrapper } = options

  const layers: string[] = [loadTemplate()]

  if (focus) {
    layers.push(`## Focus Areas\n${focus}`)
  }

  layers.push(`## Artifact to critique\n\`\`\`\n${artifact}\n\`\`\``)

  let assembled = layers.join('\n\n')

  if (promptWrapper) {
    assembled = promptWrapper.replaceAll('{{prompt}}', () => assembled)
  }

  return assembled
}
