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
  'foundation',
  'environment',
  'integration',
  'stories',
  'modeling',
  'decisions',
  'architecture',
  'specification',
  'consolidation',
  'quality',
  'planning',
  'validation',
  'finalization',
  'general',
]

// `scaffold run <step>` writes a meta-prompt to stdout. Claude Code slash
// commands re-inject that prompt into the model's context, so embedded bash
// blocks get executed by the model. Codex runs `scaffold run` as a shell
// command and treats stdout as the final result — embedded instructions
// never run. For tools whose "execution" is a deterministic shell recipe
// (review-code, review-pr), bypass the shim and emit the recipe directly so
// Codex can execute it.
const CODEX_EXECUTOR_RECIPES: Record<string, string> = {
  'review-code': `Run multi-model review on local code before commit or push
(3 MMR CLI channels + Superpowers code-reviewer as 4th channel).

\`\`\`bash
# Default — full local delivery candidate (committed branch diff + staged + unstaged):
BASE_REF=$(git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null | sed 's|refs/remotes/||' \\
  || (git rev-parse --verify origin/main >/dev/null 2>&1 && echo origin/main) \\
  || echo main)
MERGE_BASE=$(git merge-base "$BASE_REF" HEAD 2>/dev/null || echo "$BASE_REF")
git diff "$MERGE_BASE" | mmr review --diff - --sync --format json

# Or: staged only
mmr review --staged --sync --format json

# Or: explicit branch diff
mmr review --base main --head <branch> --sync --format json
\`\`\`

Capture \`job_id\` from the JSON, dispatch the Superpowers \`code-reviewer\` skill on the
same diff, and reconcile its findings as the 4th channel:

\`\`\`bash
mmr reconcile "$JOB_ID" --channel superpowers --input /tmp/agent-findings.json
\`\`\`

Verdicts: proceed only on \`pass\` or \`degraded-pass\`. On \`blocked\` or
\`needs-user-decision\`, stop and surface to the user. Fix all findings at or above
\`results.fix_threshold\` before proceeding.`,

  'review-pr': `Run multi-model review on a pull request
(3 MMR CLI channels + Superpowers code-reviewer as 4th channel).

\`\`\`bash
mmr review --pr "$PR_NUMBER" --sync --format json
\`\`\`

Capture \`job_id\` from the JSON, dispatch the Superpowers \`code-reviewer\` skill on the
PR diff, and reconcile its findings as the 4th channel:

\`\`\`bash
mmr reconcile "$JOB_ID" --channel superpowers --input /tmp/agent-findings.json
\`\`\`

Verdicts: proceed only on \`pass\` or \`degraded-pass\`. On \`blocked\` or
\`needs-user-decision\`, stop and surface to the user. Fix all findings at or above
\`results.fix_threshold\` before proceeding.`,
}

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
        .map((s) => {
          const recipe = CODEX_EXECUTOR_RECIPES[s.slug]
          return recipe
            ? `### ${s.description}\n\n${recipe}`
            : `### ${s.description}\n\nRun \`scaffold run ${s.slug}\``
        })
        .join('\n\n')
      return `## Phase: ${phase}\n\n${stepLines}`
    })

    const content = `# Scaffold Pipeline — Codex Guide

This document describes the Scaffold pipeline steps for use with Codex.

Run each step using: \`scaffold run <step-slug>\`

${sections.join('\n\n')}
`

    return {
      files: [{ relativePath: '.scaffold/generated/codex/AGENTS.md', content, writeMode: 'create' }],
      errors: [],
    }
  }
}
