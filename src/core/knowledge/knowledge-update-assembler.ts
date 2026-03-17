import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export interface AssembleOptions {
  name: string
  globalBody: string
  localOverrideContent: string | null
  methodology: string
  artifacts: string[]
  focus: string | null
}

/**
 * Lightweight template interpolator for knowledge update prompts.
 * Uses {{var}} substitution and {{#flag}}...{{/flag}} conditional blocks.
 * No dependency on AssemblyEngine or pipeline concepts.
 */
export class KnowledgeUpdateAssembler {
  constructor(private readonly template: string) {}

  assemble(options: AssembleOptions): string {
    const { name, globalBody, localOverrideContent, methodology, artifacts, focus } = options

    let output = this.template

    // Simple variable substitution
    output = output.replace(/\{\{name\}\}/g, name)
    output = output.replace(/\{\{globalBody\}\}/g, globalBody)
    output = output.replace(/\{\{methodology\}\}/g, methodology)
    output = output.replace(/\{\{localOverrideContent\}\}/g, localOverrideContent ?? '')
    output = output.replace(/\{\{artifacts\}\}/g, artifacts.join('\n\n---\n\n'))
    output = output.replace(/\{\{focus\}\}/g, focus ?? '')

    // Conditional blocks: {{#flag}}...{{/flag}}
    output = this.resolveBlock(output, 'hasLocalOverride', localOverrideContent !== null)
    output = this.resolveBlock(output, 'hasArtifacts', artifacts.length > 0)
    output = this.resolveBlock(output, 'hasFocus', focus !== null && focus.trim() !== '')

    return output.trim()
  }

  private resolveBlock(text: string, flag: string, show: boolean): string {
    const pattern = new RegExp(`\\{\\{#${flag}\\}\\}([\\s\\S]*?)\\{\\{/${flag}\\}\\}`, 'g')
    if (show) {
      return text.replace(pattern, (_match, content: string) => content)
    }
    return text.replace(pattern, '')
  }
}

/**
 * Load the knowledge-update-template.md file from the same directory as this module.
 */
export function loadTemplate(): string {
  const __dirname = path.dirname(fileURLToPath(import.meta.url))
  const templatePath = path.join(__dirname, 'knowledge-update-template.md')
  return fs.readFileSync(templatePath, 'utf8')
}
