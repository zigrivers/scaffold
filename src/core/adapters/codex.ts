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
//
// 4th-channel note: the Superpowers code-reviewer reconcile path requires a
// harness that can dispatch agent skills (e.g. Claude Code). Codex has no
// such loader, so the recipes below run the 3 MMR CLI channels only and
// point users at the Claude Code path when they need 4-channel coverage.
//
// Source-of-truth meta-prompts: `content/tools/review-code.md` and
// `content/tools/review-pr.md`. Keep the resolution chain and command
// shape here in sync with those files.
const CODEX_EXECUTOR_RECIPES: Record<string, string> = {
  'review-code': `Run multi-model review on local code before commit or push
(3 MMR CLI channels: Codex, Gemini, Claude).

\`\`\`bash
# Resolve trunk ref — same ladder as content/tools/review-code.md.
BASE_REF=""
if   ORIGIN_HEAD=$(git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null); then
  BASE_REF="\${ORIGIN_HEAD#refs/remotes/}"
elif git rev-parse --verify origin/main   >/dev/null 2>&1; then BASE_REF=origin/main
elif git rev-parse --verify main          >/dev/null 2>&1; then BASE_REF=main
elif git rev-parse --verify origin/master >/dev/null 2>&1; then BASE_REF=origin/master
elif git rev-parse --verify master        >/dev/null 2>&1; then BASE_REF=master
elif git rev-parse --verify HEAD~1        >/dev/null 2>&1; then BASE_REF=HEAD~1
else                                                            BASE_REF=HEAD
fi
MERGE_BASE=$(git merge-base "$BASE_REF" HEAD 2>/dev/null || echo "$BASE_REF")

# Default — full local delivery candidate (committed branch diff + staged + unstaged):
DIFF=$(git diff "$MERGE_BASE")
if [ -z "$DIFF" ]; then
  echo "No changes to review"; exit 0
fi
printf '%s\\n' "$DIFF" | mmr review --diff - --sync --format json

# Or: staged only
mmr review --staged --sync --format json

# Or: explicit branch diff (substitute BRANCH_NAME)
mmr review --base main --head BRANCH_NAME --sync --format json

# Optional: override fix threshold for this invocation
# mmr review --staged --fix-threshold P1 --sync --format json
\`\`\`

Verdicts: proceed only on \`pass\` or \`degraded-pass\`. On \`blocked\` or
\`needs-user-decision\`, stop and surface to the user. Fix all findings at or above
\`results.fix_threshold\` before proceeding.

**4th channel:** the Superpowers \`code-reviewer\` reconcile pass requires a
harness that can dispatch agent skills. Codex cannot do this directly — for
4-channel coverage, run \`scaffold run review-code\` from a Claude Code session
instead.`,

  'review-pr': `Run multi-model review on a pull request
(3 MMR CLI channels: Codex, Gemini, Claude).

\`\`\`bash
# Detect PR number from current branch, or set explicitly:
PR_NUMBER="\${PR_NUMBER:-$(gh pr view --json number -q .number 2>/dev/null)}"
if [ -z "$PR_NUMBER" ]; then
  echo "PR_NUMBER not set and no PR for current branch"; exit 1
fi
mmr review --pr "$PR_NUMBER" --sync --format json

# Optional: override fix threshold for this invocation
# mmr review --pr "$PR_NUMBER" --fix-threshold P1 --sync --format json
\`\`\`

Verdicts: proceed only on \`pass\` or \`degraded-pass\`. On \`blocked\` or
\`needs-user-decision\`, stop and surface to the user. Fix all findings at or above
\`results.fix_threshold\` before proceeding.

**4th channel:** the Superpowers \`code-reviewer\` reconcile pass requires a
harness that can dispatch agent skills. Codex cannot do this directly — for
4-channel coverage, run \`scaffold run review-pr\` from a Claude Code session
instead.`,
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
