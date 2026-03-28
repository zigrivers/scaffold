import type {
  PlatformAdapter,
  AdapterContext,
  AdapterInitResult,
  AdapterStepInput,
  AdapterStepOutput,
  AdapterFinalizeInput,
  AdapterFinalizeResult,
} from './adapter.js'

export class ClaudeCodeAdapter implements PlatformAdapter {
  readonly platformId = 'claude-code'

  private context: AdapterContext | null = null

  initialize(context: AdapterContext): AdapterInitResult {
    this.context = context
    return { success: true, errors: [] }
  }

  generateStepWrapper(input: AdapterStepInput): AdapterStepOutput {
    const { slug, description, dependsOn, body, sections, knowledgeEntries, longDescription } = input

    // Build YAML frontmatter
    const descriptionYaml = JSON.stringify(description)
    const longDescYaml = longDescription ? `\nlong-description: ${JSON.stringify(longDescription)}` : ''

    // Build meta-prompt body (skip Purpose section since it's in long-description)
    const bodyContent = buildBodyContent(body, sections)

    // Build knowledge section
    const knowledgeSection = buildKnowledgeSection(knowledgeEntries)

    // Build After This Step section
    const afterSection = buildAfterThisStep(dependsOn)

    const content = `---
description: ${descriptionYaml}${longDescYaml}
---

${bodyContent}${knowledgeSection}${afterSection}
`

    return {
      slug,
      platformId: this.platformId,
      files: [{ relativePath: `commands/${slug}.md`, content, writeMode: 'create' }],
      success: true,
    }
  }

  finalize(_input: AdapterFinalizeInput): AdapterFinalizeResult {
    return { files: [], errors: [] }
  }
}

/**
 * Build the main body content from the meta-prompt.
 * Includes all sections except Purpose (which goes in long-description frontmatter).
 */
function buildBodyContent(body: string, _sections: Record<string, string>): string {
  // If the body has structured sections, use the full body as-is
  // (it already has proper ## headings from the pipeline step)
  if (body.trim().length > 0) {
    return body.trim()
  }
  return ''
}

/**
 * Format knowledge entries as a Domain Knowledge section.
 * Each entry gets its own H2 subsection.
 */
function buildKnowledgeSection(
  entries: Array<{ name: string; description: string; content: string }>,
): string {
  if (entries.length === 0) return ''

  const parts = entries.map((entry) => {
    const header = `### ${entry.name}\n\n*${entry.description}*`
    return `${header}\n\n${entry.content.trim()}`
  })

  return `\n\n---\n\n## Domain Knowledge\n\n${parts.join('\n\n---\n\n')}`
}

/**
 * Build the After This Step section from forward dependencies.
 * dependsOn contains steps that come AFTER this one (downstream dependents).
 */
function buildAfterThisStep(dependsOn: string[]): string {
  if (dependsOn.length === 0) return ''

  const nextSteps = dependsOn.map((d) => `\`/scaffold:${d}\``).join(', ')
  return `\n\n---\n\n## After This Step\n\nContinue with: ${nextSteps}`
}
