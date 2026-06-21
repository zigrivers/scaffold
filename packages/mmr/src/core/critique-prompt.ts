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
 * A code fence guaranteed longer than the longest backtick run in the artifact,
 * so a design doc that itself contains ``` blocks can't terminate the fence
 * early (CommonMark's own rule). Minimum 3 backticks.
 */
function fenceFor(artifact: string): string {
  let longest = 0
  for (const match of artifact.matchAll(/`+/g)) longest = Math.max(longest, match[0].length)
  return '`'.repeat(Math.max(3, longest + 1))
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

  const fence = fenceFor(artifact)
  layers.push(`## Artifact to critique\n${fence}\n${artifact}\n${fence}`)

  let assembled = layers.join('\n\n')

  if (promptWrapper) {
    assembled = promptWrapper.replaceAll('{{prompt}}', () => assembled)
  }

  return assembled
}
