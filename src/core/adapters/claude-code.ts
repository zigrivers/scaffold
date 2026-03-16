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
    const { slug, description, dependsOn, pipelineIndex } = input

    const afterThisStep =
      dependsOn.length > 0
        ? `\n## After This Step\n\nContinue with: ${dependsOn.map((d) => `\`scaffold run ${d}\``).join(', ')}`
        : ''

    const content = `---
description: ${description}
---

Execute: \`scaffold run ${slug}\`

This is step ${pipelineIndex + 1} in the Scaffold pipeline.
${afterThisStep}
`

    return {
      slug,
      platformId: this.platformId,
      files: [{ relativePath: `commands/${slug}.md`, content, writeMode: 'create' }],
      success: true,
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  finalize(_input: AdapterFinalizeInput): AdapterFinalizeResult {
    return { files: [], errors: [] }
  }
}
