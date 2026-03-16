import type {
  PlatformAdapter,
  AdapterContext,
  AdapterInitResult,
  AdapterStepInput,
  AdapterStepOutput,
  AdapterFinalizeInput,
  AdapterFinalizeResult,
} from './adapter.js'

const PHASE_ORDER = [
  'pre',
  'modeling',
  'decisions',
  'architecture',
  'specification',
  'quality',
  'planning',
  'validation',
  'finalization',
  'general',
]

export class CodexAdapter implements PlatformAdapter {
  readonly platformId = 'codex'

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

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  finalize(_input: AdapterFinalizeInput): AdapterFinalizeResult {
    const phases = new Map<string, AdapterStepInput[]>()

    for (const step of this.collectedSteps) {
      const phase = step.phase ?? 'general'
      if (!phases.has(phase)) phases.set(phase, [])
      phases.get(phase)!.push(step)
    }

    const sections = PHASE_ORDER.filter((p) => phases.has(p)).map((phase) => {
      const steps = phases.get(phase)!
      const stepLines = steps
        .map((s) => `### ${s.description}\n\nRun \`scaffold run ${s.slug}\``)
        .join('\n\n')
      return `## Phase: ${phase}\n\n${stepLines}`
    })

    const content = `# Scaffold Pipeline — Codex Guide

This document describes the Scaffold pipeline steps for use with Codex.

Run each step using: \`scaffold run <step-slug>\`

${sections.join('\n\n')}
`

    return {
      files: [{ relativePath: 'AGENTS.md', content, writeMode: 'create' }],
      errors: [],
    }
  }
}
