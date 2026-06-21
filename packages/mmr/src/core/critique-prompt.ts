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

/** Bounded prior-round ledger item carried into an iterative round (D7). */
export interface PromptLedgerItem {
  id: string
  kind: string
  theme: string
  observation: string
}

export interface AssembleCritiquePromptOptions {
  /** The artifact to critique (design doc, plan, or problem + proposed solution). */
  artifact: string
  /** Free-text focus areas for this critique. */
  focus?: string
  /** Repository context blob (from --context repo) to ground the critique (D3). */
  repoContext?: string
  /** Persona lens preamble (from --lenses) prepended to frame the critique (D5). */
  lens?: string
  /** The immediately-prior round's items, for an iterative critique (D7). */
  priorRound?: { round: number; items: PromptLedgerItem[] }
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
  const { artifact, focus, repoContext, lens, priorRound, promptWrapper } = options

  const layers: string[] = []

  // The lens (if any) frames everything that follows.
  if (lens) layers.push(`## Your lens\n${lens}`)

  layers.push(loadTemplate())

  if (focus) {
    layers.push(`## Focus Areas\n${focus}`)
  }

  // Prior-round ledger: the artifact below is a REVISION; assess each prior point.
  if (priorRound && priorRound.items.length > 0) {
    const ledger = priorRound.items
      // Collapse newlines so a multi-line observation can't break the list item.
      .map((i) => `- [${i.id}] (${i.kind} · ${i.theme}): ${i.observation.replace(/\s*\n\s*/g, ' ')}`)
      .join('\n')
    layers.push(
      `## Previously raised (round ${priorRound.round})\n` +
      'The artifact below is a REVISION. For EACH prior point, judge whether the revision ' +
      'addresses it (state which are resolved vs. still open), then raise any NEW points.\n\n' +
      ledger,
    )
  }

  // Repo grounding goes before the artifact so the model reads the system first,
  // then judges the proposed design against it (D3).
  if (repoContext) {
    layers.push(`## Repository context\nJudge the design's fit against this codebase.\n\n${repoContext}`)
  }

  const fence = fenceFor(artifact)
  layers.push(`## Artifact to critique\n${fence}\n${artifact}\n${fence}`)

  let assembled = layers.join('\n\n')

  if (promptWrapper) {
    assembled = promptWrapper.replaceAll('{{prompt}}', () => assembled)
  }

  return assembled
}
