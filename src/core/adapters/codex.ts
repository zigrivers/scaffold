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
// such loader, so the recipes below run the 4 MMR CLI channels only and
// point users at the Claude Code path when they need 4-channel coverage.
//
// Source-of-truth meta-prompts: `content/tools/review-code.md` and
// `content/tools/review-pr.md`. Keep the resolution chain and command
// shape here in sync with those files, including native per-cycle round bounds.
const CODEX_RESUME_SETUP = `resolve_mmr_position() {
  local session_prefix="$1" latest_cycle session_json recorded_rounds

  if [ -n "\${CYCLE+x}" ] || [ -n "\${ROUND+x}" ]; then
    if [ -z "\${CYCLE+x}" ] || [ -z "\${ROUND+x}" ]; then
      echo "Set both CYCLE and ROUND, or leave both unset for session recovery." >&2
      return 1
    fi
    if ! [[ "$CYCLE" =~ ^[1-9][0-9]*$ && "$ROUND" =~ ^[1-3]$ ]]; then
      echo "CYCLE must be positive and ROUND must be 1, 2, or 3." >&2
      return 1
    fi
    return 0
  fi

  latest_cycle=$(mmr sessions list | node -e '
const sessions = JSON.parse(require("node:fs").readFileSync(0, "utf8"));
const prefix = process.argv[1];
const cycles = sessions.map(({ session_id }) =>
  session_id.startsWith(prefix) ? Number(session_id.slice(prefix.length)) : NaN
).filter((cycle) => Number.isInteger(cycle) && cycle > 0);
if (cycles.length) process.stdout.write(String(Math.max(...cycles)));
' "$session_prefix") || return 1

  if [ -z "$latest_cycle" ]; then
    CYCLE=1; ROUND=1
    return 0
  fi

  session_json=$(mmr sessions show "$session_prefix$latest_cycle") || return 1
  recorded_rounds=$(printf '%s' "$session_json" | node -e '
const record = JSON.parse(require("node:fs").readFileSync(0, "utf8"));
if (!Number.isInteger(record.rounds) || record.rounds < 0 || record.rounds > 3) process.exit(1);
process.stdout.write(String(record.rounds));
') || { echo "Invalid MMR session record; reconcile it before review." >&2; return 1; }

  if [ "$recorded_rounds" -ge 3 ]; then
    echo "Latest cycle reached round 3. After a verified repair and required gate," \
      "set CYCLE=$((latest_cycle + 1)) ROUND=1; otherwise stop." >&2
    return 1
  fi
  CYCLE="$latest_cycle"
  ROUND="$((recorded_rounds + 1))"
}`

const CODEX_EXECUTOR_RECIPES: Record<string, string> = {
  'review-code': `Run multi-model review on local code before commit or push
(4 MMR CLI channels: Codex, Claude, Grok, Antigravity). Pick **one** of the three modes
below.

**Mode 1 — full local delivery candidate** (committed branch diff + staged
+ unstaged; the most common case):

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
BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null)
[ "$BRANCH" = "HEAD" ] && BRANCH="detached-$(git rev-parse --short HEAD 2>/dev/null)"
SESSION_ID="local-$(printf '%s' "$BRANCH" | tr -c 'a-zA-Z0-9_-' '-')"
${CODEX_RESUME_SETUP}
resolve_mmr_position "$SESSION_ID-cycle-" || exit 1
MMR_FLAGS=(--session "$SESSION_ID-cycle-$CYCLE" --round "$ROUND" --max-rounds 3 --sync --format json)

# --quiet exits 0 when there's no diff. Streams the diff directly into mmr
# rather than buffering through a shell variable (large diffs can OOM).
if git diff --quiet "$MERGE_BASE"; then
  echo "No changes to review"; exit 0
fi
git diff "$MERGE_BASE" | mmr review --diff - "\${MMR_FLAGS[@]}"
\`\`\`

**Mode 2 — staged changes only** (e.g. pre-commit gate):

\`\`\`bash
BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null)
[ "$BRANCH" = "HEAD" ] && BRANCH="detached-$(git rev-parse --short HEAD 2>/dev/null)"
SESSION_ID="local-$(printf '%s' "$BRANCH" | tr -c 'a-zA-Z0-9_-' '-')"
${CODEX_RESUME_SETUP}
resolve_mmr_position "$SESSION_ID-cycle-" || exit 1
mmr review --staged --session "$SESSION_ID-cycle-$CYCLE" --round "$ROUND" --max-rounds 3 --sync --format json
\`\`\`

**Mode 3 — explicit branch diff** (substitute the actual branch name for
\`BRANCH_NAME\`):

\`\`\`bash
BRANCH_NAME="<branch-name>"
SESSION_ID="local-$(printf '%s' "$BRANCH_NAME" | tr -c 'a-zA-Z0-9_-' '-')"
${CODEX_RESUME_SETUP}
resolve_mmr_position "$SESSION_ID-cycle-" || exit 1
mmr review --base main --head "$BRANCH_NAME" --session "$SESSION_ID-cycle-$CYCLE" \
  --round "$ROUND" --max-rounds 3 --sync --format json
\`\`\`

Append \`--fix-threshold P0|P1|P2|P3\` to any of the above to override the
project's configured threshold for this invocation.

Use at most three rounds per cycle. After each verified repair, increment
\`ROUND\` and review the new exact head. If round three leaves a reproducible
in-scope or required-safeguard defect, make a concrete repair, add focused
regression proof, pass the required gate, increment \`CYCLE\`, reset \`ROUND\`
to 1, and review again. Duplicate, stale, hypothetical, speculative, cosmetic,
or already-dispositioned findings cannot start a new cycle. Never advance on a
\`blocked\` or \`needs-user-decision\` result.

**4th channel:** the Superpowers \`code-reviewer\` reconcile pass requires a
harness that can dispatch agent skills. Codex cannot do this directly — for
4-channel coverage, run \`scaffold run review-code\` from a Claude Code session
instead.`,

  'review-pr': `Run multi-model review on a pull request
(4 MMR CLI channels: Codex, Claude, Grok, Antigravity).

\`\`\`bash
# Detect PR number from current branch, or set explicitly:
PR_NUMBER="\${PR_NUMBER:-$(gh pr view --json number -q .number 2>/dev/null)}"
if [ -z "$PR_NUMBER" ]; then
  echo "PR_NUMBER not set and no PR for current branch"; exit 1
fi
${CODEX_RESUME_SETUP}
resolve_mmr_position "pr-$PR_NUMBER-cycle-" || exit 1
mmr review --pr "$PR_NUMBER" --session "pr-$PR_NUMBER-cycle-$CYCLE" --round "$ROUND" --max-rounds 3 --sync --format json
\`\`\`

Append \`--fix-threshold P0|P1|P2|P3\` to override the project's configured
threshold for this invocation.

Use at most three rounds per cycle. After each verified repair, increment
\`ROUND\` and review the new exact head. If round three leaves a reproducible
in-scope or required-safeguard defect, make a concrete repair, add focused
regression proof, pass the required gate, increment \`CYCLE\`, reset \`ROUND\`
to 1, and review the same PR again. Duplicate, stale, hypothetical, speculative,
cosmetic, or already-dispositioned findings cannot start a new cycle. Never
advance on a \`blocked\` or \`needs-user-decision\` result.

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

Run each step using \`scaffold run <step-slug>\` **unless the step below
provides an inline shell recipe** — in that case, run the recipe directly.
\`scaffold run\` writes a meta-prompt to stdout that Codex cannot interpret
as instructions, so steps with executable shell behavior emit the commands
inline here.

${sections.join('\n\n')}
`

    return {
      files: [{ relativePath: '.scaffold/generated/codex/AGENTS.md', content, writeMode: 'create' }],
      errors: [],
    }
  }
}
