import type { UserInstructions } from '../../types/index.js'
import type { ScaffoldWarning } from '../../types/index.js'
import { fileExists } from '../../utils/fs.js'
import fs from 'node:fs'
import path from 'node:path'

/**
 * Load user instructions from three layers with later-overrides-earlier precedence.
 * Layer 1 (global): .scaffold/instructions/global.md
 * Layer 2 (per-step): .scaffold/instructions/<step>.md
 * Layer 3 (inline): --instructions CLI flag value
 *
 * Returns each layer separately so the assembly engine can display them with
 * clear source provenance.
 */
export function loadInstructions(
  projectRoot: string,
  step: string,
  inline?: string,
): { instructions: UserInstructions; warnings: ScaffoldWarning[] } {
  const instructionsDir = path.join(projectRoot, '.scaffold', 'instructions')
  const warnings: ScaffoldWarning[] = []

  const globalPath = path.join(instructionsDir, 'global.md')
  const stepPath = path.join(instructionsDir, `${step}.md`)

  const global = readInstruction(globalPath, 'global', warnings)
  const perStep = readInstruction(stepPath, step, warnings)
  const inlineValue = inline?.trim() || null

  return {
    instructions: { global, perStep, inline: inlineValue },
    warnings,
  }
}

function readInstruction(
  filePath: string,
  name: string,
  warnings: ScaffoldWarning[],
): string | null {
  if (!fileExists(filePath)) return null
  const content = fs.readFileSync(filePath, 'utf8').trim()
  if (content === '') {
    warnings.push({
      code: 'ASM_INSTRUCTION_EMPTY',
      message: `Instruction file "${name}" exists but is empty`,
      context: { file: filePath },
    })
    return null
  }
  return content
}
