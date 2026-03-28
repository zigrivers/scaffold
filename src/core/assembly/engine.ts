import type {
  AssemblyOptions,
  AssemblyResult,
  AssembledPrompt,
  AssemblyMetadata,
  PromptSection,
  KnowledgeEntry,
  ArtifactEntry,
  UserInstructions,
} from '../../types/index.js'
import type { DepthLevel, DepthProvenance } from '../../types/index.js'
import { ExitCode } from '../../types/index.js'

/** Depth guidance text for each level 1-5 (ADR-045). */
const DEPTH_GUIDANCE: Record<number, string> = {
  1: 'Focus on the essential deliverable only.',
  2: 'Cover primary use cases; skip advanced configurations.',
  3: 'Full requirements coverage with common edge cases.',
  4: 'Thorough analysis including performance and alternatives.',
  5: 'Exhaustive exploration of all angles and tradeoffs.',
}

/** Depth scale descriptions for each level in the Methodology section. */
const DEPTH_SCALE_DESCRIPTIONS: Record<number, string> = {
  1: 'Depth 1 (MVP): Focus on core requirements only. Minimal viable output.',
  2: 'Depth 2 (Lite): Cover primary use cases. Skip edge cases and advanced configurations.',
  3: 'Depth 3 (Standard): Full coverage of requirements. Include common edge cases.',
  4: 'Depth 4 (Thorough): Deep coverage including edge cases, performance considerations, and alternatives.',
  5: 'Depth 5 (Exhaustive): Maximum depth. Explore all angles, tradeoffs, alternatives, and implications.',
}

const SECTION_HEADINGS = [
  'System',
  'Meta-Prompt',
  'Knowledge Base',
  'Project Context',
  'Methodology',
  'Instructions',
  'Execution',
] as const

/**
 * AssemblyEngine — takes pre-loaded components and assembles them into a
 * 7-section prompt string following ADR-045.
 *
 * Pure orchestrator: no file I/O, no async. All data comes via assemble() options.
 */
export class AssemblyEngine {
  /**
   * Assemble the prompt for a single pipeline step.
   * Returns AssemblyResult with success/failure, prompt, errors, and warnings.
   */
  assemble(step: string, options: AssemblyOptions): AssemblyResult {
    const startMs = Date.now()

    // --- Validation ---
    if (options.metaPrompt == null) {
      return {
        success: false,
        errors: [
          {
            code: 'ASM_META_PROMPT_MISSING',
            message: `Meta-prompt is missing for step "${step}". Cannot assemble prompt.`,
            exitCode: ExitCode.ValidationError,
            recovery: 'Ensure the meta-prompt file exists and was loaded before calling assemble().',
          },
        ],
        warnings: [],
      }
    }

    const depth = options.depth
    if (depth < 1 || depth > 5 || !Number.isInteger(depth)) {
      return {
        success: false,
        errors: [
          {
            code: 'ASM_INVALID_DEPTH',
            message: `Invalid depth "${depth}" for step "${step}". Depth must be an integer between 1 and 5.`,
            exitCode: ExitCode.ValidationError,
            recovery: 'Provide a depth value between 1 and 5.',
          },
        ],
        warnings: [],
      }
    }

    try {
      const artifacts = options.artifacts ?? []
      const decisions = options.decisions ?? ''

      // --- Build the 7 sections ---
      const sections: PromptSection[] = [
        { heading: 'System', content: this.buildSystemSection(step, options) },
        { heading: 'Meta-Prompt', content: options.metaPrompt.body },
        { heading: 'Knowledge Base', content: this.buildKnowledgeBaseSection(options.knowledgeEntries) },
        { heading: 'Project Context', content: this.buildProjectContextSection(artifacts, decisions, options) },
        { heading: 'Methodology', content: this.buildMethodologySection(depth, options.depthProvenance) },
        { heading: 'Instructions', content: this.buildInstructionsSection(options.instructions, options.reworkFix) },
        { heading: 'Execution', content: this.buildExecutionSection(depth) },
      ]

      // --- Concatenate text ---
      const text = sections
        .map(s => `# ${s.heading}\n\n${s.content}\n\n`)
        .join('')

      // --- Build metadata ---
      const assemblyDurationMs = Date.now() - startMs

      const instructionLayers = this.resolveInstructionLayers(options.instructions)
      const decisionCount =
        decisions.trim() === '' ? 0 : decisions.trim().split('\n').filter(l => l.trim() !== '').length

      const metadata: AssemblyMetadata = {
        stepName: step,
        depth,
        depthProvenance: options.depthProvenance,
        knowledgeBaseEntries: options.knowledgeEntries.map(e => e.name),
        instructionLayers,
        artifactCount: artifacts.length,
        decisionCount,
        assemblyDurationMs,
        assembledAt: new Date().toISOString(),
        updateMode: options.updateMode,
        sectionsIncluded: [...SECTION_HEADINGS],
      }

      const prompt: AssembledPrompt = { text, sections, metadata }

      return { success: true, prompt, errors: [], warnings: [] }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return {
        success: false,
        errors: [
          {
            code: 'ASM_UNEXPECTED_ERROR',
            message: `Unexpected error assembling step "${step}": ${message}`,
            exitCode: ExitCode.BuildError,
          },
        ],
        warnings: [],
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Section builders
  // ---------------------------------------------------------------------------

  private buildSystemSection(step: string, options: AssemblyOptions): string {
    const { state, config, depth } = options
    const methodology = config.methodology

    const steps = Object.values(state.steps)
    const totalCount = steps.length
    const completedCount = steps.filter(s => s.status === 'completed').length

    return [
      'You are an expert software architect and senior developer working on a software project.',
      `You are executing step ${step} of the Scaffold pipeline.`,
      `Methodology: ${methodology} | Depth: ${depth}/5 | Progress: ${completedCount}/${totalCount} steps`,
    ].join('\n')
  }

  private buildKnowledgeBaseSection(entries: KnowledgeEntry[]): string {
    if (entries.length === 0) {
      return '(No knowledge base entries specified for this step.)'
    }

    return entries
      .map(entry => `## ${entry.name}: ${entry.description}\n\n${entry.content}`)
      .join('\n\n')
  }

  private buildProjectContextSection(
    artifacts: ArtifactEntry[],
    decisions: string,
    options: AssemblyOptions,
  ): string {
    const parts: string[] = []

    // Artifacts
    for (const artifact of artifacts) {
      parts.push(`## Artifact: ${artifact.filePath}\n\n${artifact.content}`)
    }

    // Decisions log
    if (decisions.trim() !== '') {
      parts.push(`## Decisions Log\n\n${decisions}`)
    }

    // Existing artifact in update mode
    if (options.updateMode && options.existingArtifact) {
      const ea = options.existingArtifact
      parts.push(
        `## Existing Output: ${ea.filePath}\n\n${ea.content}\n\n` +
          '*Note: You are in update mode. Revise the existing output to incorporate new requirements.*',
      )
    }

    if (parts.length === 0) {
      return '(No prior artifacts available.)'
    }

    return parts.join('\n\n')
  }

  private buildMethodologySection(depth: DepthLevel, depthProvenance: DepthProvenance): string {
    const guidance = DEPTH_GUIDANCE[depth] ?? ''
    const scaleLines = Object.entries(DEPTH_SCALE_DESCRIPTIONS)
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([, desc]) => `- ${desc}`)
      .join('\n')

    return [
      `Executing at depth ${depth}/5.`,
      '',
      'Depth scale guidance:',
      scaleLines,
      '',
      `Current depth: ${depth} — ${guidance}`,
      `Depth determined by: ${depthProvenance}`,
    ].join('\n')
  }

  private buildInstructionsSection(instructions: UserInstructions, reworkFix?: boolean): string {
    const parts: string[] = []

    if (instructions.global != null) {
      parts.push(`### Global Instructions\n\n${instructions.global}`)
    }

    if (instructions.perStep != null) {
      parts.push(`### Step-Specific Instructions\n\n${instructions.perStep}`)
    }

    if (instructions.inline != null) {
      parts.push(`### Inline Instructions\n\n${instructions.inline}`)
    }

    if (reworkFix) {
      parts.push(
        '### Rework Mode: Auto-Fix Enabled\n\n' +
        'You are re-running this review step in rework mode. Instead of just listing issues:\n' +
        '1. Read the artifact being reviewed\n' +
        '2. Identify all issues at the current depth level\n' +
        '3. Apply fixes directly to the artifact\n' +
        '4. Summarize what you changed and why',
      )
    }

    if (parts.length === 0) {
      return '(No user instructions provided.)'
    }

    return parts.join('\n\n')
  }

  private buildExecutionSection(depth: DepthLevel): string {
    return [
      'Execute this step now. Produce all required outputs as specified in the meta-prompt above.',
      `Work methodically at depth ${depth}/5. When complete, summarize what you produced and any decisions made.`,
    ].join('\n')
  }

  private resolveInstructionLayers(
    instructions: UserInstructions,
  ): Array<'global' | 'per-step' | 'inline'> {
    const layers: Array<'global' | 'per-step' | 'inline'> = []
    if (instructions.global != null) layers.push('global')
    if (instructions.perStep != null) layers.push('per-step')
    if (instructions.inline != null) layers.push('inline')
    return layers
  }
}
