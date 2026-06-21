import type {
  PlatformAdapter,
  AdapterContext,
  AdapterInitResult,
  AdapterStepInput,
  AdapterStepOutput,
  AdapterFinalizeInput,
  AdapterFinalizeResult,
} from './adapter.js'
import { renderGapSignalTail } from '../assembly/gap-signal-tail.js'

/**
 * Generates OpenCode custom commands. OpenCode auto-discovers markdown files
 * under `.opencode/command/` and runs each as a prompt when invoked (a nested
 * `command/scaffold/<slug>.md` is invoked as `/scaffold/<slug>`). The `$ARGUMENTS`
 * placeholder injects whatever the user passes after the command.
 */
export class OpenCodeAdapter implements PlatformAdapter {
  readonly platformId = 'opencode'

  private context: AdapterContext | null = null

  initialize(context: AdapterContext): AdapterInitResult {
    this.context = context
    return { success: true, errors: [] }
  }

  generateStepWrapper(input: AdapterStepInput): AdapterStepOutput {
    const { slug, description, dependsOn, body, knowledgeEntries } = input

    const bodyContent = body.trim()
    const knowledgeSection = buildKnowledgeSection(knowledgeEntries, slug)
    const afterSection = buildAfterThisStep(dependsOn)

    const content = `---
description: ${JSON.stringify(description)}
---

${bodyContent}${knowledgeSection}${afterSection}

---

User request: $ARGUMENTS
`

    return {
      slug,
      platformId: this.platformId,
      files: [{ relativePath: `.opencode/command/scaffold/${slug}.md`, content, writeMode: 'create' }],
      success: true,
    }
  }

  finalize(_input: AdapterFinalizeInput): AdapterFinalizeResult {
    return { files: [], errors: [] }
  }
}

/** Format knowledge entries as a Domain Knowledge section (one H3 per entry). */
function buildKnowledgeSection(
  entries: Array<{ name: string; description: string; content: string }>,
  stepSlug: string,
): string {
  if (entries.length === 0) return ''

  const parts = entries.map((entry) => `### ${entry.name}\n\n*${entry.description}*\n\n${entry.content.trim()}`)
  const body = `\n\n---\n\n## Domain Knowledge\n\n${parts.join('\n\n---\n\n')}`
  const tail = renderGapSignalTail({ stepName: stepSlug })
  return tail ? `${body}\n\n${tail}` : body
}

/** Build the After This Step section from forward dependencies (downstream steps). */
function buildAfterThisStep(dependsOn: string[]): string {
  if (dependsOn.length === 0) return ''

  const nextSteps = dependsOn.map((d) => `\`/scaffold/${d}\``).join(', ')
  return `\n\n---\n\n## After This Step\n\nContinue with: ${nextSteps}`
}
