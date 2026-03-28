import type {
  PlatformAdapter,
  AdapterContext,
  AdapterInitResult,
  AdapterStepInput,
  AdapterStepOutput,
  AdapterFinalizeInput,
  AdapterFinalizeResult,
} from './adapter.js'

export class UniversalAdapter implements PlatformAdapter {
  readonly platformId = 'universal'

  private context: AdapterContext | null = null
  private collectedSteps: AdapterStepInput[] = []

  initialize(context: AdapterContext): AdapterInitResult {
    this.context = context
    this.collectedSteps = []
    return { success: true, errors: [] }
  }

  generateStepWrapper(input: AdapterStepInput): AdapterStepOutput {
    this.collectedSteps.push(input)
    return {
      slug: input.slug,
      platformId: this.platformId,
      files: [],
      success: true,
    }
  }

  finalize(_input: AdapterFinalizeInput): AdapterFinalizeResult {
    const stepList = this.collectedSteps
      .map((s) => `- \`scaffold run ${s.slug}\` — ${s.description}`)
      .join('\n')

    const content = `# Scaffold Pipeline

Use \`scaffold run <step>\` with any AI tool to execute pipeline steps.

## Steps

${stepList || '(No steps configured)'}

## Usage

1. Run \`scaffold run <step-slug>\` to assemble the prompt for that step
2. Paste the prompt output into your AI tool
3. The AI will execute the step and produce the required outputs
4. After completion, run \`scaffold run\` again to mark the step complete
`

    return {
      files: [{ relativePath: 'prompts/README.md', content, writeMode: 'create' }],
      errors: [],
    }
  }
}
